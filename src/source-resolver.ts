import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'

export interface SourceContext {
  filename: string
  startLine: number
  endLine: number
  lines: string[]
}

/**
 * Resolve source code context for a given file and line
 */
export function resolveSource(
  filename: string,
  line: number,
  sourceDir: string,
  contextLines: number = 3
): SourceContext | null {
  // Try to find the file
  const filePath = findSourceFile(filename, sourceDir)
  if (!filePath) {
    return null
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const allLines = content.split('\n')

    const startLine = Math.max(1, line - contextLines)
    const endLine = Math.min(allLines.length, line + contextLines)

    const extractedLines = allLines.slice(startLine - 1, endLine)

    return {
      filename: filename,
      startLine,
      endLine,
      lines: extractedLines
    }
  } catch {
    return null
  }
}

/**
 * Find a source file given a filename from the profile
 */
function findSourceFile(filename: string, sourceDir: string): string | null {
  // Handle absolute paths
  if (isAbsolute(filename)) {
    if (existsSync(filename)) {
      return filename
    }
    // Try stripping leading directories to find relative match
    const parts = filename.split('/')
    for (let i = 0; i < parts.length; i++) {
      const relativePath = parts.slice(i).join('/')
      const candidate = join(sourceDir, relativePath)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  // Handle relative paths
  const directPath = join(sourceDir, filename)
  if (existsSync(directPath)) {
    return directPath
  }

  // Try common source directory patterns
  const commonPrefixes = ['src/', 'lib/', 'app/', '']
  for (const prefix of commonPrefixes) {
    const candidate = join(sourceDir, prefix, filename)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  // Try stripping node_modules prefix
  if (filename.includes('node_modules/')) {
    const idx = filename.indexOf('node_modules/')
    const modulePath = filename.slice(idx)
    const candidate = join(sourceDir, modulePath)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * Batch resolve multiple source locations
 */
export function resolveMultipleSources(
  locations: Array<{ filename: string; line: number }>,
  sourceDir: string,
  contextLines: number = 3
): Map<string, SourceContext> {
  const results = new Map<string, SourceContext>()
  const cache = new Map<string, string[]>()

  for (const loc of locations) {
    const key = `${loc.filename}:${loc.line}`

    // Skip if already resolved or no filename
    if (results.has(key) || !loc.filename) {
      continue
    }

    // Try to get file contents from cache or read
    let allLines = cache.get(loc.filename)
    if (!allLines) {
      const filePath = findSourceFile(loc.filename, sourceDir)
      if (filePath) {
        try {
          const content = readFileSync(filePath, 'utf-8')
          allLines = content.split('\n')
          cache.set(loc.filename, allLines)
        } catch {
          continue
        }
      }
    }

    if (allLines) {
      const startLine = Math.max(1, loc.line - contextLines)
      const endLine = Math.min(allLines.length, loc.line + contextLines)
      const extractedLines = allLines.slice(startLine - 1, endLine)

      results.set(key, {
        filename: loc.filename,
        startLine,
        endLine,
        lines: extractedLines
      })
    }
  }

  return results
}
