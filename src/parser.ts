import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Profile } from 'pprof-format'
import type {
  NormalizedProfile,
  SampleType,
  FunctionInfo,
  Location,
  LineInfo,
  Sample,
  PeriodType,
  ProfileType,
  Numeric
} from './types.ts'

/**
 * Parse a pprof profile from a file path or buffer
 */
export function parseProfile(input: string | Buffer): NormalizedProfile {
  let buffer: Buffer

  if (typeof input === 'string') {
    buffer = readFileSync(input)
  } else if (Buffer.isBuffer(input)) {
    buffer = input
  } else {
    throw new Error('Input must be a file path or Buffer')
  }

  // Decompress if gzipped
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    buffer = gunzipSync(buffer)
  }

  const profile = Profile.decode(buffer)
  return normalizeProfile(profile)
}

/**
 * Normalize the profile by resolving string table references
 */
function normalizeProfile(profile: Profile): NormalizedProfile {
  // Get strings from the StringTable class
  const stringTable: string[] = profile.stringTable?.strings ?? []

  const getString = (index: Numeric | undefined): string => {
    if (index === 0 || index === 0n || index === undefined) return ''
    const idx = typeof index === 'bigint' ? Number(index) : index
    return stringTable[idx] ?? ''
  }

  // Resolve sample types
  const sampleTypes: SampleType[] = (profile.sampleType ?? []).map((st) => ({
    type: getString(st.type),
    unit: getString(st.unit)
  }))

  // Build function map
  const functions = new Map<Numeric, FunctionInfo>()
  for (const fn of profile.function ?? []) {
    functions.set(fn.id, {
      id: fn.id,
      name: getString(fn.name),
      systemName: getString(fn.systemName),
      filename: getString(fn.filename),
      startLine: Number(fn.startLine)
    })
  }

  // Build location map
  const locations = new Map<Numeric, Location>()
  for (const loc of profile.location ?? []) {
    const lines: LineInfo[] = (loc.line ?? []).map((line) => {
      const fn = functions.get(line.functionId) ?? {
        id: 0,
        name: '<unknown>',
        systemName: '',
        filename: '',
        startLine: 0
      }
      return {
        functionId: line.functionId,
        line: Number(line.line),
        function: fn
      }
    })

    locations.set(loc.id, {
      id: loc.id,
      address: loc.address,
      lines
    })
  }

  // Resolve samples
  const samples: Sample[] = (profile.sample ?? []).map((sample) => {
    const stack: Location[] = (sample.locationId ?? []).map((locId) => {
      const loc = locations.get(locId)
      if (!loc) {
        return {
          id: locId,
          address: 0,
          lines: [
            {
              functionId: 0,
              line: 0,
              function: {
                id: 0,
                name: '<unknown>',
                systemName: '',
                filename: '',
                startLine: 0
              }
            }
          ]
        }
      }
      return loc
    })

    return {
      stack,
      values: sample.value ?? [],
      labels: (sample.label ?? []).map((label) => ({
        key: getString(label.key),
        str: getString(label.str),
        num: label.num,
        numUnit: getString(label.numUnit)
      }))
    }
  })

  // Extract metadata
  const dropFrames = getString(profile.dropFrames)
  const keepFrames = getString(profile.keepFrames)
  const comment = (profile.comment ?? []).map((c) => getString(c))

  let periodType: PeriodType | null = null
  if (profile.periodType) {
    periodType = {
      type: getString(profile.periodType.type),
      unit: getString(profile.periodType.unit)
    }
  }

  return {
    sampleTypes,
    samples,
    locations,
    functions,
    dropFrames,
    keepFrames,
    comment,
    defaultSampleType: profile.defaultSampleType,
    durationNanos: profile.durationNanos,
    timeNanos: profile.timeNanos,
    period: profile.period,
    periodType
  }
}

/**
 * Detect the profile type (CPU, heap, etc.)
 */
export function detectProfileType(profile: NormalizedProfile): ProfileType {
  const types = profile.sampleTypes.map((st) => st.type.toLowerCase())
  const units = profile.sampleTypes.map((st) => st.unit.toLowerCase())

  // CPU profiles: look for time-based samples or 'sample'/'samples'/'cpu'/'wall'
  if (
    types.includes('cpu') ||
    types.includes('samples') ||
    types.includes('sample') ||
    types.includes('wall')
  ) {
    return 'cpu'
  }

  // Heap profiles: look for memory-related types
  if (
    types.includes('alloc_objects') ||
    types.includes('alloc_space') ||
    types.includes('inuse_objects') ||
    types.includes('inuse_space') ||
    types.includes('objects') ||
    types.includes('space')
  ) {
    return 'heap'
  }

  // Also detect by units
  if (units.includes('nanoseconds') || units.includes('microseconds')) {
    return 'cpu'
  }
  if (units.includes('bytes') && types.some((t) => t.includes('object'))) {
    return 'heap'
  }

  if (types.includes('contentions') || types.includes('delay')) {
    return 'mutex'
  }
  if (types.includes('goroutines') || types.includes('count')) {
    return 'goroutine'
  }

  return 'unknown'
}
