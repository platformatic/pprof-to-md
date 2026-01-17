import { formatValue } from '../analyzer.ts'
import type {
  AnalysisResult,
  ProfileType,
  FormatOptions,
  Hotspot,
  CriticalPath
} from '../types.ts'

/**
 * Format analysis results in summary format
 * Compact, high-signal format for quick analysis
 */
export function formatSummary(
  analysis: AnalysisResult,
  profileType: ProfileType,
  options: FormatOptions = {}
): string {
  const { profileName = 'profile.pb', maxHotspots = 10, maxPaths = 5 } = options

  const lines: string[] = []

  // Header
  lines.push(`=== PPROF ANALYSIS: ${profileType.toUpperCase()} ===`)
  lines.push(`Profile: ${profileName}`)

  // Duration and sample info
  const durationNanos = Number(analysis.durationNanos)
  const durationSec =
    durationNanos > 0
      ? `${(durationNanos / 1e9).toFixed(1)}s`
      : 'N/A'
  lines.push(
    `Duration: ${durationSec} | Samples: ${analysis.totalSamples.toLocaleString()} | Type: ${analysis.sampleType.type} (${analysis.sampleType.unit})`
  )
  lines.push('')

  // Top hotspots table
  lines.push('## TOP HOTSPOTS (by self-time)')
  lines.push(formatHotspotsTable(analysis.hotspots.slice(0, maxHotspots)))
  lines.push('')

  // Critical paths
  if (analysis.criticalPaths.length > 0) {
    lines.push('## CRITICAL PATHS (top cumulative chains)')
    for (let i = 0; i < Math.min(analysis.criticalPaths.length, maxPaths); i++) {
      const path = analysis.criticalPaths[i]
      lines.push(formatCriticalPath(i + 1, path))
    }
    lines.push('')
  }

  // Key observations
  lines.push('## KEY OBSERVATIONS')
  const observations = generateObservations(analysis, profileType)
  for (const obs of observations) {
    lines.push(`- ${obs}`)
  }

  return lines.join('\n')
}

function formatHotspotsTable(hotspots: Hotspot[]): string {
  if (hotspots.length === 0) {
    return '(No significant hotspots detected)'
  }

  const lines: string[] = []

  // Calculate column widths
  const maxNameLen = Math.min(
    40,
    Math.max(...hotspots.map((h) => h.name.length))
  )
  const maxLocLen = Math.min(
    25,
    Math.max(...hotspots.map((h) => formatLocation(h).length))
  )

  // Header
  lines.push(
    '┌─────┬' +
      '─'.repeat(maxNameLen + 2) +
      '┬────────┬────────┬' +
      '─'.repeat(maxLocLen + 2) +
      '┐'
  )
  lines.push(
    '│ Rank│ ' +
      'Function'.padEnd(maxNameLen) +
      ' │ Self%  │ Cum%   │ ' +
      'Location'.padEnd(maxLocLen) +
      ' │'
  )
  lines.push(
    '├─────┼' +
      '─'.repeat(maxNameLen + 2) +
      '┼────────┼────────┼' +
      '─'.repeat(maxLocLen + 2) +
      '┤'
  )

  // Rows
  for (let i = 0; i < hotspots.length; i++) {
    const h = hotspots[i]
    const name = truncate(h.name, maxNameLen)
    const loc = truncate(formatLocation(h), maxLocLen)
    const selfPct = h.selfPercent.toFixed(1).padStart(5) + '%'
    const cumPct = h.cumulativePercent.toFixed(1).padStart(5) + '%'

    lines.push(
      `│ ${(i + 1).toString().padStart(3)} │ ${name.padEnd(maxNameLen)} │ ${selfPct} │ ${cumPct} │ ${loc.padEnd(maxLocLen)} │`
    )
  }

  // Footer
  lines.push(
    '└─────┴' +
      '─'.repeat(maxNameLen + 2) +
      '┴────────┴────────┴' +
      '─'.repeat(maxLocLen + 2) +
      '┘'
  )

  return lines.join('\n')
}

function formatLocation(hotspot: Hotspot): string {
  if (!hotspot.filename || hotspot.filename === '') {
    return '<native>'
  }
  // Shorten path - just filename and line
  const parts = hotspot.filename.split('/')
  const filename = parts[parts.length - 1]
  return `${filename}:${hotspot.line}`
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

function formatCriticalPath(index: number, path: CriticalPath): string {
  const pathStr = path.path
    .slice(1) // Skip root
    .map((node) => node.name)
    .join(' → ')
  return `${index}. [${path.cumulativePercent.toFixed(1)}%] ${pathStr}`
}

function generateObservations(
  analysis: AnalysisResult,
  profileType: ProfileType
): string[] {
  const observations: string[] = []
  const hotspots = analysis.hotspots

  if (hotspots.length === 0) {
    observations.push('No significant hotspots detected in this profile')
    return observations
  }

  // Top hotspot observation
  const top = hotspots[0]
  const isNative = !top.filename || top.filename === ''
  if (isNative) {
    observations.push(
      `Native ${top.name} dominates (${top.selfPercent.toFixed(1)}% self-time)`
    )
  } else {
    observations.push(
      `${top.name} is the top hotspot (${top.selfPercent.toFixed(1)}% self-time)`
    )
  }

  // Count native vs application code
  const nativeHotspots = hotspots.filter(
    (h) => !h.filename || h.filename === ''
  )
  const appHotspots = hotspots.filter((h) => h.filename && h.filename !== '')

  const nativePct = nativeHotspots.reduce((sum, h) => sum + h.selfPercent, 0)
  const appPct = appHotspots.reduce((sum, h) => sum + h.selfPercent, 0)

  if (nativePct > appPct && nativePct > 30) {
    observations.push(
      `Native code accounts for ${nativePct.toFixed(1)}% of self-time`
    )
  } else if (appPct > 30) {
    observations.push(
      `Application code accounts for ${appPct.toFixed(1)}% of self-time (optimizable)`
    )
  }

  // Look for convergence points (functions called from many paths)
  const highCumulative = hotspots.filter(
    (h) => h.cumulativePercent > 50 && h.callers.length > 1
  )
  if (highCumulative.length > 0) {
    const conv = highCumulative[0]
    observations.push(
      `${conv.callers.length} distinct paths converge at ${conv.name}`
    )
  }

  // Profile-specific observations
  if (profileType === 'heap') {
    const topByCount = [...hotspots].sort(
      (a, b) => b.sampleCount - a.sampleCount
    )[0]
    if (topByCount && topByCount !== top) {
      observations.push(
        `${topByCount.name} has highest allocation count (potential GC pressure)`
      )
    }
  }

  return observations.slice(0, 5)
}
