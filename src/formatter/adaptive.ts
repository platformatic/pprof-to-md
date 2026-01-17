import { formatValue } from '../analyzer.ts'
import { resolveSource, type SourceContext } from '../source-resolver.ts'
import type {
  AnalysisResult,
  ProfileType,
  FormatOptions,
  Hotspot,
  CriticalPath,
  CallTreeNode
} from '../types.ts'

/**
 * Format analysis results in adaptive format
 * Summary with drill-down sections for detailed investigation
 */
export function formatAdaptive(
  analysis: AnalysisResult,
  profileType: ProfileType,
  options: FormatOptions = {}
): string {
  const {
    profileName = 'profile.pb',
    maxHotspots = 10,
    sourceDir,
    includeSource = true
  } = options

  const lines: string[] = []

  // Header
  lines.push(`=== PPROF ANALYSIS: ${profileType.toUpperCase()} ===`)
  lines.push(`Profile: ${profileName}`)
  lines.push(
    `Duration: ${formatDuration(analysis.durationNanos)} | Samples: ${analysis.totalSamples.toLocaleString()}`
  )
  lines.push('')

  // Executive summary
  lines.push('## EXECUTIVE SUMMARY')
  const summary = generateExecutiveSummary(analysis, profileType)
  for (const line of summary) {
    lines.push(line)
  }
  lines.push('')

  // Top hotspots with drill-down markers
  lines.push('## TOP HOTSPOTS')
  const topHotspots = analysis.hotspots.slice(0, maxHotspots)
  for (let i = 0; i < topHotspots.length; i++) {
    const h = topHotspots[i]
    const drillId = generateDrillId(h.name)
    lines.push(
      `${i + 1}. ${h.name} (${h.selfPercent.toFixed(1)}%) [DRILL:${drillId}]`
    )
  }
  lines.push('')

  // Critical paths
  if (analysis.criticalPaths.length > 0) {
    lines.push('## CRITICAL PATHS')
    for (let i = 0; i < Math.min(analysis.criticalPaths.length, 3); i++) {
      const path = analysis.criticalPaths[i]
      const pathStr = path.path
        .slice(1)
        .map((n) => n.name)
        .join(' → ')
      lines.push(`${i + 1}. [${path.cumulativePercent.toFixed(1)}%] ${pathStr}`)
    }
    lines.push('')
  }

  // Drill-down sections
  lines.push('## DRILL-DOWN SECTIONS')
  lines.push('')

  for (const hotspot of topHotspots) {
    const drillId = generateDrillId(hotspot.name)
    lines.push(`[SECTION:${drillId}]`)
    lines.push(
      formatDrillDownSection(hotspot, analysis, sourceDir, includeSource)
    )
    lines.push(`[/SECTION:${drillId}]`)
    lines.push('')
  }

  return lines.join('\n')
}

function formatDuration(nanos: number | bigint): string {
  const num = Number(nanos)
  if (num <= 0) return 'N/A'
  const sec = num / 1e9
  if (sec >= 60) {
    const min = Math.floor(sec / 60)
    const remainSec = sec % 60
    return `${min}m ${remainSec.toFixed(0)}s`
  }
  return `${sec.toFixed(1)}s`
}

function generateExecutiveSummary(
  analysis: AnalysisResult,
  profileType: ProfileType
): string[] {
  const lines: string[] = []
  const hotspots = analysis.hotspots

  if (hotspots.length === 0) {
    lines.push('No significant bottlenecks detected.')
    return lines
  }

  // Primary bottleneck
  const primary = hotspots[0]
  lines.push(
    `Primary bottleneck: ${primary.name} (${primary.selfPercent.toFixed(1)}% of ${profileType === 'cpu' ? 'CPU' : 'allocations'})`
  )

  // Secondary bottleneck
  if (hotspots.length > 1) {
    const secondary = hotspots[1]
    lines.push(
      `Secondary bottleneck: ${secondary.name} (${secondary.selfPercent.toFixed(1)}%)`
    )
  }

  // Optimization potential assessment
  const appCode = hotspots.filter((h) => h.filename && h.filename !== '')
  const appPct = appCode.reduce((sum, h) => sum + h.selfPercent, 0)

  let potential: string
  if (appPct > 50) {
    potential = 'HIGH'
  } else if (appPct > 20) {
    potential = 'MEDIUM'
  } else {
    potential = 'LOW'
  }

  lines.push(
    `Optimization potential: ${potential} (${appPct.toFixed(0)}% in application code)`
  )

  return lines
}

function generateDrillId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

function formatDrillDownSection(
  hotspot: Hotspot,
  analysis: AnalysisResult,
  sourceDir?: string,
  includeSource: boolean = true
): string {
  const lines: string[] = []
  const isNative = !hotspot.filename || hotspot.filename === ''

  lines.push(`### ${hotspot.name} Analysis`)

  // Find path to this hotspot
  const pathToHotspot = findPathToFunction(analysis.callTree, hotspot.name)
  if (pathToHotspot.length > 0) {
    lines.push(`Full path: ${pathToHotspot.join(' → ')}`)
  }

  lines.push(
    `Self-time: ${hotspot.selfPercent.toFixed(1)}% (${hotspot.sampleCount.toLocaleString()} samples)`
  )
  lines.push(`Nature: ${isNative ? 'Native V8/Node.js function' : 'Application code'}`)
  lines.push('')

  // Call context
  lines.push('Call context:')
  if (hotspot.callers.length > 0) {
    for (const caller of hotspot.callers.slice(0, 5)) {
      lines.push(`- Called from ${caller}`)
    }
    if (hotspot.callers.length > 5) {
      lines.push(`- ... and ${hotspot.callers.length - 5} more callers`)
    }
  } else {
    lines.push('- Entry point or root function')
  }
  lines.push('')

  // Source code context if available and requested
  if (includeSource && !isNative && sourceDir && hotspot.filename) {
    const source = resolveSource(
      hotspot.filename,
      hotspot.line,
      sourceDir
    )
    if (source) {
      lines.push('Related source:')
      lines.push('```javascript')
      lines.push(`// ${source.filename}:${source.startLine}-${source.endLine}`)
      for (let i = 0; i < source.lines.length; i++) {
        const lineNum = source.startLine + i
        const marker = lineNum === hotspot.line ? ' // ← HOT' : ''
        lines.push(`${source.lines[i]}${marker}`)
      }
      lines.push('```')
      lines.push('')
    }
  }

  // Insights based on patterns
  const insights = generateInsights(hotspot, analysis)
  if (insights.length > 0) {
    lines.push('Insights:')
    for (const insight of insights) {
      lines.push(`- ${insight}`)
    }
  }

  return lines.join('\n')
}

function findPathToFunction(
  tree: CallTreeNode,
  targetName: string,
  currentPath: string[] = []
): string[] {
  if (tree.name === targetName) {
    return [...currentPath, tree.name]
  }

  for (const child of tree.children.values()) {
    const path = findPathToFunction(child, targetName, [...currentPath, tree.name])
    if (path.length > 0) {
      return path
    }
  }

  return []
}

function generateInsights(
  hotspot: Hotspot,
  analysis: AnalysisResult
): string[] {
  const insights: string[] = []
  const name = hotspot.name.toLowerCase()

  // Check for single caller (optimization opportunity)
  if (hotspot.callers.length === 1) {
    insights.push(`Always called from ${hotspot.callers[0]} - consider inlining or specialization`)
  }

  // High cumulative vs self ratio suggests it's a coordinator function
  if (
    hotspot.cumulativePercent > hotspot.selfPercent * 3 &&
    hotspot.callees.length > 0
  ) {
    insights.push(
      'High cumulative time relative to self-time suggests this is a coordinator function'
    )
    insights.push(
      `Callees account for most time: ${hotspot.callees.slice(0, 3).join(', ')}`
    )
  }

  // Pattern-specific insights
  if (name.includes('json')) {
    insights.push('JSON operations suggest data transformation overhead')
  }

  if (name.includes('regex') || name.includes('regexp')) {
    insights.push('Regular expression matching can be expensive - check pattern complexity')
  }

  if (name.includes('sort')) {
    insights.push('Sorting operations scale with input size - check if pre-sorting or caching helps')
  }

  if (name.includes('map') || name.includes('filter') || name.includes('reduce')) {
    insights.push('Array iteration methods - consider loop fusion or early termination')
  }

  return insights.slice(0, 5)
}
