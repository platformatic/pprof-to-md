import type {
  NormalizedProfile,
  SampleType,
  FunctionStats,
  CallTreeNode,
  Hotspot,
  CriticalPath,
  PathNode,
  AnalysisResult,
  ProfileType,
  Numeric
} from './types.ts'

interface AnalyzeOptions {
  sampleTypeIndex?: number
  hotspotThreshold?: number
}

// Helper to convert Numeric to number
function toNum(value: Numeric): number {
  return typeof value === 'bigint' ? Number(value) : value
}

// Helper to add Numeric values
function addNumeric(a: Numeric, b: Numeric): Numeric {
  if (typeof a === 'bigint' && typeof b === 'bigint') {
    return a + b
  }
  return toNum(a) + toNum(b)
}

/**
 * Analyze a profile and extract statistics
 */
export function analyzeProfile(
  profile: NormalizedProfile,
  options: AnalyzeOptions = {}
): AnalysisResult {
  const { sampleTypeIndex = 0, hotspotThreshold = 0.01 } = options

  const sampleType = profile.sampleTypes[sampleTypeIndex]
  if (!sampleType) {
    throw new Error(`Sample type index ${sampleTypeIndex} not found`)
  }

  // Calculate total value
  let totalValue: Numeric = 0
  for (const sample of profile.samples) {
    const value = sample.values[sampleTypeIndex] ?? 0
    totalValue = addNumeric(totalValue, value)
  }

  if (toNum(totalValue) === 0) {
    return {
      sampleType,
      totalValue: 0,
      totalSamples: profile.samples.length,
      functionStats: new Map(),
      callTree: createEmptyNode('(root)'),
      hotspots: [],
      criticalPaths: [],
      durationNanos: profile.durationNanos,
      period: profile.period,
      periodType: profile.periodType
    }
  }

  // Aggregate function statistics
  const functionStats = aggregateFunctionStats(
    profile,
    sampleTypeIndex,
    totalValue
  )

  // Build call tree
  const callTree = buildCallTree(profile, sampleTypeIndex, totalValue)

  // Identify hotspots
  const hotspots = identifyHotspots(functionStats, hotspotThreshold)

  // Extract critical paths
  const criticalPaths = extractCriticalPaths(callTree, 5)

  return {
    sampleType,
    totalValue,
    totalSamples: profile.samples.length,
    functionStats,
    callTree,
    hotspots,
    criticalPaths,
    durationNanos: profile.durationNanos,
    period: profile.period,
    periodType: profile.periodType
  }
}

/**
 * Aggregate statistics per function
 */
function aggregateFunctionStats(
  profile: NormalizedProfile,
  sampleTypeIndex: number,
  totalValue: Numeric
): Map<string, FunctionStats> {
  const stats = new Map<string, FunctionStats>()

  const getOrCreateStats = (
    fn: { name: string; filename: string; startLine: number },
    line: number
  ): FunctionStats => {
    const key = `${fn.name}@${fn.filename}:${line}`
    let existing = stats.get(key)
    if (!existing) {
      existing = {
        key,
        name: fn.name,
        filename: fn.filename,
        line: line || fn.startLine,
        selfValue: 0,
        cumulativeValue: 0,
        selfPercent: 0,
        cumulativePercent: 0,
        sampleCount: 0,
        callers: new Set(),
        callees: new Set()
      }
      stats.set(key, existing)
    }
    return existing
  }

  for (const sample of profile.samples) {
    const value = sample.values[sampleTypeIndex] ?? 0
    if (toNum(value) === 0) continue

    const seenInStack = new Set<string>()

    // Stack is ordered from leaf (index 0) to root
    for (let i = 0; i < sample.stack.length; i++) {
      const location = sample.stack[i]
      const lines = location.lines

      for (const lineInfo of lines) {
        const fn = lineInfo.function
        const fnStats = getOrCreateStats(fn, lineInfo.line)
        const key = fnStats.key

        // Self time: only count for leaf (first location in stack)
        if (i === 0) {
          fnStats.selfValue = addNumeric(fnStats.selfValue, value)
        }

        // Cumulative: count once per sample
        if (!seenInStack.has(key)) {
          fnStats.cumulativeValue = addNumeric(fnStats.cumulativeValue, value)
          fnStats.sampleCount++
          seenInStack.add(key)
        }

        // Track callers and callees
        if (i < sample.stack.length - 1) {
          const callerLoc = sample.stack[i + 1]
          for (const callerLine of callerLoc.lines) {
            fnStats.callers.add(callerLine.function.name)
          }
        }
        if (i > 0) {
          const calleeLoc = sample.stack[i - 1]
          for (const calleeLine of calleeLoc.lines) {
            fnStats.callees.add(calleeLine.function.name)
          }
        }
      }
    }
  }

  // Calculate percentages
  const totalNum = toNum(totalValue)
  for (const fnStats of stats.values()) {
    fnStats.selfPercent = (toNum(fnStats.selfValue) / totalNum) * 100
    fnStats.cumulativePercent =
      (toNum(fnStats.cumulativeValue) / totalNum) * 100
  }

  return stats
}

/**
 * Build a call tree from samples
 */
function buildCallTree(
  profile: NormalizedProfile,
  sampleTypeIndex: number,
  totalValue: Numeric
): CallTreeNode {
  const root = createEmptyNode('(root)')
  root.cumulativeValue = totalValue
  root.cumulativePercent = 100

  for (const sample of profile.samples) {
    const value = sample.values[sampleTypeIndex] ?? 0
    if (toNum(value) === 0) continue

    let currentNode = root

    // Walk from root to leaf (reverse of stack order)
    for (let i = sample.stack.length - 1; i >= 0; i--) {
      const location = sample.stack[i]
      const lines = location.lines

      for (const lineInfo of lines) {
        const fn = lineInfo.function
        const key = `${fn.name}@${fn.filename}:${lineInfo.line}`

        let child = currentNode.children.get(key)
        if (!child) {
          child = {
            key,
            name: fn.name,
            filename: fn.filename,
            line: lineInfo.line || fn.startLine,
            selfValue: 0,
            cumulativeValue: 0,
            selfPercent: 0,
            cumulativePercent: 0,
            children: new Map()
          }
          currentNode.children.set(key, child)
        }

        currentNode = child
        currentNode.cumulativeValue = addNumeric(currentNode.cumulativeValue, value)
      }
    }

    // Leaf node gets self time
    currentNode.selfValue = addNumeric(currentNode.selfValue, value)
  }

  // Calculate percentages recursively
  calculateTreePercentages(root, totalValue)

  return root
}

function createEmptyNode(name: string): CallTreeNode {
  return {
    key: name,
    name,
    filename: '',
    line: 0,
    selfValue: 0,
    cumulativeValue: 0,
    selfPercent: 0,
    cumulativePercent: 0,
    children: new Map()
  }
}

function calculateTreePercentages(
  node: CallTreeNode,
  totalValue: Numeric
): void {
  const totalNum = toNum(totalValue)
  node.selfPercent = (toNum(node.selfValue) / totalNum) * 100
  node.cumulativePercent = (toNum(node.cumulativeValue) / totalNum) * 100

  for (const child of node.children.values()) {
    calculateTreePercentages(child, totalValue)
  }
}

/**
 * Identify hotspots (functions with high self or cumulative time)
 */
function identifyHotspots(
  functionStats: Map<string, FunctionStats>,
  threshold: number
): Hotspot[] {
  const hotspots: Hotspot[] = []

  for (const stats of functionStats.values()) {
    if (stats.selfPercent >= threshold * 100) {
      hotspots.push({
        key: stats.key,
        name: stats.name,
        filename: stats.filename,
        line: stats.line,
        selfValue: stats.selfValue,
        cumulativeValue: stats.cumulativeValue,
        selfPercent: stats.selfPercent,
        cumulativePercent: stats.cumulativePercent,
        sampleCount: stats.sampleCount,
        type: 'self',
        callers: Array.from(stats.callers),
        callees: Array.from(stats.callees)
      })
    }
  }

  // Sort by self percentage descending
  hotspots.sort((a, b) => b.selfPercent - a.selfPercent)

  return hotspots
}

/**
 * Extract critical paths (highest cumulative paths through the tree)
 */
function extractCriticalPaths(
  callTree: CallTreeNode,
  maxPaths: number = 5
): CriticalPath[] {
  const paths: CriticalPath[] = []

  function traverse(
    node: CallTreeNode,
    currentPath: PathNode[],
    cumulativePercent: number
  ): void {
    const newPath: PathNode[] = [
      ...currentPath,
      {
        name: node.name,
        selfPercent: node.selfPercent,
        cumulativePercent: node.cumulativePercent
      }
    ]

    if (node.children.size === 0) {
      // Leaf node - record path
      paths.push({
        path: newPath,
        cumulativePercent
      })
    } else {
      // Sort children by cumulative value and traverse
      const sortedChildren = Array.from(node.children.values()).sort(
        (a, b) => toNum(b.cumulativeValue) - toNum(a.cumulativeValue)
      )

      // Only follow the hottest child for critical path
      const hottestChild = sortedChildren[0]
      traverse(hottestChild, newPath, cumulativePercent)

      // Also record paths for other significant children
      for (
        let i = 1;
        i < sortedChildren.length && paths.length < maxPaths * 2;
        i++
      ) {
        const child = sortedChildren[i]
        if (child.cumulativePercent >= 5) {
          traverse(child, newPath, child.cumulativePercent)
        }
      }
    }
  }

  // Start traversal from root's children
  const sortedRootChildren = Array.from(callTree.children.values()).sort(
    (a, b) => toNum(b.cumulativeValue) - toNum(a.cumulativeValue)
  )

  for (const child of sortedRootChildren.slice(0, maxPaths)) {
    traverse(child, [], child.cumulativePercent)
  }

  // Sort by cumulative percentage and take top paths
  paths.sort((a, b) => b.cumulativePercent - a.cumulativePercent)

  return paths.slice(0, maxPaths)
}

/**
 * Get the primary sample type index for a profile type
 */
export function getPrimarySampleTypeIndex(
  profile: NormalizedProfile,
  profileType: ProfileType
): number {
  const types = profile.sampleTypes

  if (profileType === 'cpu') {
    // Prefer 'samples' or 'cpu'
    for (let i = 0; i < types.length; i++) {
      const t = types[i].type.toLowerCase()
      if (t === 'samples' || t === 'cpu') return i
    }
  } else if (profileType === 'heap') {
    // Prefer 'inuse_space' for current memory, 'alloc_space' for allocations
    for (let i = 0; i < types.length; i++) {
      const t = types[i].type.toLowerCase()
      if (t === 'inuse_space') return i
    }
    for (let i = 0; i < types.length; i++) {
      const t = types[i].type.toLowerCase()
      if (t === 'alloc_space') return i
    }
  }

  return 0
}

/**
 * Format a value with appropriate units
 */
export function formatValue(value: Numeric, unit: string): string {
  const num = toNum(value)
  const lowerUnit = (unit || '').toLowerCase()

  if (lowerUnit === 'nanoseconds' || lowerUnit === 'ns') {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}s`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}ms`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}µs`
    return `${num}ns`
  }

  if (lowerUnit === 'bytes') {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)} GB`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)} MB`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)} KB`
    return `${num} B`
  }

  if (lowerUnit === 'count' || lowerUnit === 'samples') {
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    return `${num}`
  }

  return `${num} ${unit}`
}
