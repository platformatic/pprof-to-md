import { formatSummary } from './summary.ts'
import { formatDetailed } from './detailed.ts'
import { formatAdaptive } from './adaptive.ts'
import type {
  AnalysisResult,
  ProfileType,
  FormatLevel,
  FormatOptions
} from '../types.ts'

export { formatSummary } from './summary.ts'
export { formatDetailed } from './detailed.ts'
export { formatAdaptive } from './adaptive.ts'

/**
 * Format analysis results using the specified format level
 */
export function format(
  analysis: AnalysisResult,
  profileType: ProfileType,
  level: FormatLevel = 'summary',
  options: FormatOptions = {}
): string {
  switch (level) {
    case 'summary':
      return formatSummary(analysis, profileType, options)
    case 'detailed':
      return formatDetailed(analysis, profileType, options)
    case 'adaptive':
      return formatAdaptive(analysis, profileType, options)
    default:
      throw new Error(`Unknown format level: ${level}`)
  }
}
