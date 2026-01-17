// Main library exports
export { parseProfile, detectProfileType } from './parser.ts'
export {
  analyzeProfile,
  getPrimarySampleTypeIndex,
  formatValue
} from './analyzer.ts'
export {
  format,
  formatSummary,
  formatDetailed,
  formatAdaptive
} from './formatter/index.ts'
export { resolveSource, resolveMultipleSources } from './source-resolver.ts'
export type {
  NormalizedProfile,
  AnalysisResult,
  FunctionStats,
  Hotspot,
  CallTreeNode,
  CriticalPath,
  ProfileType,
  FormatLevel,
  FormatOptions,
  SampleType
} from './types.ts'

import { parseProfile, detectProfileType } from './parser.ts'
import { analyzeProfile, getPrimarySampleTypeIndex } from './analyzer.ts'
import { format } from './formatter/index.ts'
import type { FormatLevel, FormatOptions, ProfileType } from './types.ts'

export interface ConvertOptions extends FormatOptions {
  format?: FormatLevel
  profileType?: ProfileType
  sampleTypeIndex?: number
}

/**
 * Convert a pprof profile to LLM-friendly text format
 * Main entry point for programmatic usage
 */
export function convert(
  input: string | Buffer,
  options: ConvertOptions = {}
): string {
  const {
    format: formatLevel = 'summary',
    profileType: explicitType,
    sampleTypeIndex,
    ...formatOptions
  } = options

  // Parse the profile
  const profile = parseProfile(input)

  // Detect or use specified profile type
  const profileType = explicitType ?? detectProfileType(profile)

  // Get sample type index
  const typeIndex = sampleTypeIndex ?? getPrimarySampleTypeIndex(profile, profileType)

  // Analyze the profile
  const analysis = analyzeProfile(profile, {
    sampleTypeIndex: typeIndex,
    hotspotThreshold: formatOptions.hotspotThreshold ?? 0.01
  })

  // Format the output
  return format(analysis, profileType, formatLevel, formatOptions)
}
