// Numeric type to match pprof-format's Numeric (number | bigint)
export type Numeric = number | bigint

export interface SampleType {
  type: string
  unit: string
}

export interface FunctionInfo {
  id: Numeric
  name: string
  systemName: string
  filename: string
  startLine: number
}

export interface LineInfo {
  functionId: Numeric
  line: number
  function: FunctionInfo
}

export interface Location {
  id: Numeric
  address: Numeric
  lines: LineInfo[]
}

export interface Label {
  key: string
  str: string
  num: Numeric
  numUnit: string
}

export interface Sample {
  stack: Location[]
  values: Numeric[]
  labels: Label[]
}

export interface PeriodType {
  type: string
  unit: string
}

export interface NormalizedProfile {
  sampleTypes: SampleType[]
  samples: Sample[]
  locations: Map<Numeric, Location>
  functions: Map<Numeric, FunctionInfo>
  dropFrames: string
  keepFrames: string
  comment: string[]
  defaultSampleType: Numeric
  durationNanos: Numeric
  timeNanos: Numeric
  period: Numeric
  periodType: PeriodType | null
}

export interface FunctionStats {
  key: string
  name: string
  filename: string
  line: number
  selfValue: Numeric
  cumulativeValue: Numeric
  selfPercent: number
  cumulativePercent: number
  sampleCount: number
  callers: Set<string>
  callees: Set<string>
}

export interface Hotspot extends Omit<FunctionStats, 'callers' | 'callees'> {
  type: string
  callers: string[]
  callees: string[]
}

export interface CallTreeNode {
  key: string
  name: string
  filename: string
  line: number
  selfValue: Numeric
  cumulativeValue: Numeric
  selfPercent: number
  cumulativePercent: number
  children: Map<string, CallTreeNode>
}

export interface PathNode {
  name: string
  selfPercent: number
  cumulativePercent: number
}

export interface CriticalPath {
  path: PathNode[]
  cumulativePercent: number
}

export interface AnalysisResult {
  sampleType: SampleType
  totalValue: Numeric
  totalSamples: number
  functionStats: Map<string, FunctionStats>
  callTree: CallTreeNode
  hotspots: Hotspot[]
  criticalPaths: CriticalPath[]
  durationNanos: Numeric
  period: Numeric
  periodType: PeriodType | null
}

export type ProfileType = 'cpu' | 'heap' | 'mutex' | 'goroutine' | 'unknown'

export type FormatLevel = 'summary' | 'detailed' | 'adaptive'

export interface FormatOptions {
  profileName?: string
  sourceDir?: string
  includeSource?: boolean
  maxHotspots?: number
  maxPaths?: number
  hotspotThreshold?: number
}
