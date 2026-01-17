import { formatValue } from '../analyzer.ts'
import type {
  AnalysisResult,
  ProfileType,
  FormatOptions,
  Hotspot,
  CriticalPath
} from '../types.ts'

/**
 * Format analysis results in summary format (Markdown)
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
  lines.push(`# PPROF Analysis: ${profileType.toUpperCase()}`)
  lines.push('')
  lines.push(`**Profile:** \`${profileName}\``)

  // Duration and sample info
  const durationNanos = Number(analysis.durationNanos)
  const durationSec =
    durationNanos > 0
      ? `${(durationNanos / 1e9).toFixed(1)}s`
      : 'N/A'
  lines.push(`**Duration:** ${durationSec} | **Samples:** ${analysis.totalSamples.toLocaleString()} | **Type:** ${analysis.sampleType.type} (${analysis.sampleType.unit})`)
  lines.push('')

  // Top hotspots table
  lines.push('## Top Hotspots (by self-time)')
  lines.push('')
  lines.push(formatHotspotsTable(analysis.hotspots.slice(0, maxHotspots)))
  lines.push('')

  // Critical paths
  if (analysis.criticalPaths.length > 0) {
    lines.push('## Critical Paths (top cumulative chains)')
    lines.push('')
    for (let i = 0; i < Math.min(analysis.criticalPaths.length, maxPaths); i++) {
      const path = analysis.criticalPaths[i]
      lines.push(formatCriticalPath(i + 1, path))
    }
    lines.push('')
  }

  // Key observations
  lines.push('## Key Observations')
  lines.push('')
  const observations = generateObservations(analysis, profileType)
  for (const obs of observations) {
    lines.push(`- ${obs}`)
  }

  return lines.join('\n')
}

function formatHotspotsTable(hotspots: Hotspot[]): string {
  if (hotspots.length === 0) {
    return '*No significant hotspots detected*'
  }

  const lines: string[] = []

  // Markdown table header
  lines.push('| Rank | Function | Self% | Cum% | Location |')
  lines.push('|------|----------|-------|------|----------|')

  // Rows
  for (let i = 0; i < hotspots.length; i++) {
    const h = hotspots[i]
    const name = escapeMarkdown(h.name)
    const loc = escapeMarkdown(formatLocation(h))
    const selfPct = `${h.selfPercent.toFixed(1)}%`
    const cumPct = `${h.cumulativePercent.toFixed(1)}%`

    lines.push(`| ${i + 1} | \`${name}\` | ${selfPct} | ${cumPct} | \`${loc}\` |`)
  }

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

function escapeMarkdown(str: string): string {
  return str.replace(/\|/g, '\\|').replace(/`/g, '\\`')
}

function formatCriticalPath(index: number, path: CriticalPath): string {
  const pathStr = path.path
    .slice(1) // Skip root
    .map((node) => `\`${node.name}\``)
    .join(' → ')
  return `${index}. **[${path.cumulativePercent.toFixed(1)}%]** ${pathStr}`
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
      `Native \`${top.name}\` dominates (**${top.selfPercent.toFixed(1)}%** self-time)`
    )
  } else {
    observations.push(
      `\`${top.name}\` is the top hotspot (**${top.selfPercent.toFixed(1)}%** self-time)`
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
      `Native code accounts for **${nativePct.toFixed(1)}%** of self-time`
    )
  } else if (appPct > 30) {
    observations.push(
      `Application code accounts for **${appPct.toFixed(1)}%** of self-time (optimizable)`
    )
  }

  // Look for convergence points (functions called from many paths)
  const highCumulative = hotspots.filter(
    (h) => h.cumulativePercent > 50 && h.callers.length > 1
  )
  if (highCumulative.length > 0) {
    const conv = highCumulative[0]
    observations.push(
      `${conv.callers.length} distinct paths converge at \`${conv.name}\``
    )
  }

  // Profile-specific observations
  if (profileType === 'heap') {
    const topByCount = [...hotspots].sort(
      (a, b) => b.sampleCount - a.sampleCount
    )[0]
    if (topByCount && topByCount !== top) {
      observations.push(
        `\`${topByCount.name}\` has highest allocation count (potential GC pressure)`
      )
    }
  }

  return observations.slice(0, 5)
}
