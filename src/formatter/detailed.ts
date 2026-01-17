import { formatValue } from '../analyzer.ts'
import type {
  AnalysisResult,
  ProfileType,
  FormatOptions,
  CallTreeNode,
  Hotspot
} from '../types.ts'

const HOTSPOT_THRESHOLD = 5 // Mark as hotspot if self% >= 5

/**
 * Format analysis results in detailed format (Markdown)
 * Full context with annotated call trees
 */
export function formatDetailed(
  analysis: AnalysisResult,
  profileType: ProfileType,
  options: FormatOptions = {}
): string {
  const { profileName = 'profile.pb', maxHotspots = 15 } = options

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

  lines.push(`**Duration:** ${durationSec} | **Samples:** ${analysis.totalSamples.toLocaleString()} | **Sample Rate:** ${formatSampleRate(analysis)}`)

  if (analysis.periodType) {
    lines.push(`**Collected:** ${new Date().toISOString().split('T')[0]}`)
  }
  lines.push('')

  // Metadata section
  lines.push('## Metadata')
  lines.push('')
  lines.push(`- **Sample Type:** ${analysis.sampleType.type} (${analysis.sampleType.unit})`)
  lines.push(`- **Total Value:** ${formatValue(analysis.totalValue, analysis.sampleType.unit)}`)
  if (Number(analysis.period) > 0) {
    lines.push(`- **Sample Period:** ${formatValue(analysis.period, analysis.periodType?.unit ?? '')}`)
  }
  lines.push('')

  // Call tree section
  lines.push('## Call Tree (annotated flame graph)')
  lines.push('')
  lines.push('> Legend: `[self% | cum%] function @ location`')
  lines.push('')
  lines.push('```')
  lines.push(formatCallTree(analysis.callTree, '', true, new Set()))
  lines.push('```')
  lines.push('')

  // Function details section
  lines.push('## Function Details')
  lines.push('')
  const topHotspots = analysis.hotspots.slice(0, maxHotspots)
  for (const hotspot of topHotspots) {
    lines.push(formatFunctionDetail(hotspot, analysis))
    lines.push('')
  }

  // Hotspot analysis section
  lines.push('## Hotspot Analysis')
  lines.push('')
  for (let i = 0; i < Math.min(topHotspots.length, 5); i++) {
    const hotspot = topHotspots[i]
    lines.push(formatHotspotAnalysis(i + 1, hotspot))
    lines.push('')
  }

  return lines.join('\n')
}

function formatSampleRate(analysis: AnalysisResult): string {
  const durationNanos = Number(analysis.durationNanos)
  if (durationNanos > 0 && analysis.totalSamples > 0) {
    const durationSec = durationNanos / 1e9
    const rate = analysis.totalSamples / durationSec
    if (rate >= 1000) {
      return `${(rate / 1000).toFixed(1)}kHz`
    }
    return `${rate.toFixed(0)}Hz`
  }
  return 'N/A'
}

function formatCallTree(
  node: CallTreeNode,
  prefix: string,
  isLast: boolean,
  visited: Set<string>,
  depth: number = 0
): string {
  const lines: string[] = []

  // Limit depth to prevent excessive output
  if (depth > 20) {
    return prefix + '└── ... (truncated)'
  }

  // Format current node
  const selfPct = node.selfPercent.toFixed(1).padStart(5)
  const cumPct = node.cumulativePercent.toFixed(1).padStart(5)
  const location = formatLocation(node)
  const isHotspot = node.selfPercent >= HOTSPOT_THRESHOLD
  const hotspotMarker = isHotspot ? '  ◀ HOTSPOT' : ''

  const connector = depth === 0 ? '' : isLast ? '└── ' : '├── '
  lines.push(
    `${prefix}${connector}[${selfPct}% | ${cumPct}%] ${node.name} @ ${location}${hotspotMarker}`
  )

  // Prevent infinite loops with visited tracking
  if (visited.has(node.key)) {
    return lines.join('\n')
  }
  visited.add(node.key)

  // Sort children by cumulative value
  const sortedChildren = Array.from(node.children.values())
    .filter((child) => child.cumulativePercent >= 0.5) // Filter out noise
    .sort((a, b) => Number(b.cumulativeValue) - Number(a.cumulativeValue))
    .slice(0, 10) // Limit children per node

  const childPrefix = prefix + (depth === 0 ? '' : isLast ? '    ' : '│   ')

  for (let i = 0; i < sortedChildren.length; i++) {
    const child = sortedChildren[i]
    const isChildLast = i === sortedChildren.length - 1
    lines.push(
      formatCallTree(child, childPrefix, isChildLast, visited, depth + 1)
    )
  }

  return lines.join('\n')
}

function formatLocation(node: CallTreeNode): string {
  if (!node.filename || node.filename === '') {
    return '<native>'
  }
  // Shorten long paths
  let filename = node.filename
  if (filename.includes('node_modules/')) {
    const idx = filename.indexOf('node_modules/')
    filename = filename.slice(idx)
  } else if (filename.length > 40) {
    const parts = filename.split('/')
    filename = parts.slice(-2).join('/')
  }
  return `${filename}:${node.line}`
}

function formatFunctionDetail(
  hotspot: Hotspot,
  analysis: AnalysisResult
): string {
  const lines: string[] = []
  const location = !hotspot.filename
    ? '<native>'
    : `${hotspot.filename}:${hotspot.line}`

  lines.push(`### \`${hotspot.name}\` @ \`${location}\``)
  lines.push('')

  const selfFormatted = formatValue(
    hotspot.selfValue,
    analysis.sampleType.unit
  )
  const cumFormatted = formatValue(
    hotspot.cumulativeValue,
    analysis.sampleType.unit
  )

  lines.push(`**Samples:** ${hotspot.sampleCount.toLocaleString()} (${hotspot.selfPercent.toFixed(1)}% self) | **Cumulative:** ${cumFormatted} (${hotspot.cumulativePercent.toFixed(1)}%)`)

  if (hotspot.callers.length > 0) {
    const callerStr =
      hotspot.callers.length <= 3
        ? hotspot.callers.map(c => `\`${c}\``).join(', ')
        : hotspot.callers.slice(0, 3).map(c => `\`${c}\``).join(', ') +
          ` (+${hotspot.callers.length - 3} more)`
    lines.push(`**Callers:** ${callerStr}`)
  }

  if (hotspot.callees.length > 0) {
    const calleeStr =
      hotspot.callees.length <= 3
        ? hotspot.callees.map(c => `\`${c}\``).join(', ')
        : hotspot.callees.slice(0, 3).map(c => `\`${c}\``).join(', ') +
          ` (+${hotspot.callees.length - 3} more)`
    lines.push(`**Callees:** ${calleeStr}`)
  }

  return lines.join('\n')
}

function formatHotspotAnalysis(index: number, hotspot: Hotspot): string {
  const lines: string[] = []
  const isNative = !hotspot.filename || hotspot.filename === ''

  lines.push(`### Hotspot #${index}: \`${hotspot.name}\` (${hotspot.selfPercent.toFixed(1)}%)`)
  lines.push('')
  lines.push(`**Type:** ${isNative ? 'Native function' : 'Application code'}`)

  if (!isNative) {
    lines.push(`**Location:** \`${hotspot.filename}:${hotspot.line}\``)
  }

  // Add contextual hints based on function name patterns
  const hints = generateHints(hotspot)
  if (hints.length > 0) {
    lines.push('')
    if (isNative) {
      lines.push('**Mitigation strategies:**')
    } else {
      lines.push('**Investigation hints:**')
    }
    for (const hint of hints) {
      lines.push(`- ${hint}`)
    }
  }

  return lines.join('\n')
}

function generateHints(hotspot: Hotspot): string[] {
  const name = hotspot.name.toLowerCase()
  const hints: string[] = []

  // JSON-related
  if (name.includes('json.parse') || name.includes('json_parse')) {
    hints.push('Large JSON payloads being parsed')
    hints.push('Consider streaming parser for large bodies')
    hints.push('Cache parsed results if payloads repeat')
  } else if (name.includes('json.stringify') || name.includes('json_stringify')) {
    hints.push('Large objects being serialized')
    hints.push('Consider streaming serialization')
    hints.push('Use faster serialization (fast-json-stringify)')
  }

  // RegExp
  if (name.includes('regexp') || name.includes('regex')) {
    hints.push('Pre-compile RegExp patterns (move outside hot path)')
    hints.push('Simplify patterns if possible')
    hints.push('Consider string methods for simple checks')
  }

  // Buffer operations
  if (name.includes('buffer')) {
    hints.push('Consider buffer pooling to reduce allocations')
    hints.push('Use Buffer.allocUnsafe for performance-critical paths')
  }

  // Crypto
  if (name.includes('crypto') || name.includes('hash')) {
    hints.push('Crypto operations are CPU-intensive by design')
    hints.push('Consider caching hash results where possible')
    hints.push('Evaluate if weaker/faster algorithm is acceptable')
  }

  // Generic application code
  if (hints.length === 0 && hotspot.filename) {
    hints.push('Review function implementation for optimization opportunities')
    hints.push('Check for unnecessary work or redundant calculations')
    if (hotspot.callees.length > 5) {
      hints.push('Function has many callees - consider if all calls are necessary')
    }
  }

  return hints
}
