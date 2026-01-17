#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { convert } from './index.ts'
import type { FormatLevel, ProfileType } from './types.ts'

const helpText = `
pprof-to-llm - Convert pprof profiles to LLM-friendly text format

USAGE:
  pprof-to-llm [options] <profile.pb[.gz]>

OPTIONS:
  -f, --format <level>    Output format: summary, detailed, adaptive (default: adaptive)
  -t, --type <type>       Profile type: cpu, heap, auto (default: auto)
  -o, --output <file>     Output file (default: stdout)
  -s, --source-dir <dir>  Source directory for code context
  --no-source             Disable source code inclusion
  --max-hotspots <n>      Maximum hotspots to show (default: 10)
  -h, --help              Show this help message
  -v, --version           Show version

EXAMPLES:
  # Basic usage - analyze a CPU profile
  pprof-to-llm cpu-profile.pb.gz

  # Detailed output with source context
  pprof-to-llm --format=detailed --source-dir=./src profile.pb.gz

  # Adaptive format for iterative analysis
  pprof-to-llm --format=adaptive profile.pb -o analysis.txt

  # Memory profile analysis
  pprof-to-llm --type=heap heap-profile.pb.gz

FORMAT LEVELS:
  summary   - Compact table of hotspots and critical paths (best for quick triage)
  detailed  - Full call tree with function details (best for deep analysis)
  adaptive  - Summary with drill-down sections (best for iterative investigation)
`

function main(): void {
  const { values, positionals } = parseArgs({
    options: {
      format: { type: 'string', short: 'f', default: 'adaptive' },
      type: { type: 'string', short: 't', default: 'auto' },
      output: { type: 'string', short: 'o' },
      'source-dir': { type: 'string', short: 's' },
      'no-source': { type: 'boolean', default: false },
      'max-hotspots': { type: 'string', default: '10' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false }
    },
    allowPositionals: true
  })

  if (values.help) {
    console.log(helpText)
    process.exit(0)
  }

  if (values.version) {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
    )
    console.log(`pprof-to-llm v${pkg.version}`)
    process.exit(0)
  }

  if (positionals.length === 0) {
    console.error('Error: No profile file specified')
    console.error('Use --help for usage information')
    process.exit(1)
  }

  const profilePath = positionals[0]

  if (!existsSync(profilePath)) {
    console.error(`Error: File not found: ${profilePath}`)
    process.exit(1)
  }

  // Validate format option
  const formatLevel = values.format as FormatLevel
  if (!['summary', 'detailed', 'adaptive'].includes(formatLevel)) {
    console.error(`Error: Invalid format: ${formatLevel}`)
    console.error('Valid formats: summary, detailed, adaptive')
    process.exit(1)
  }

  // Validate type option
  const profileTypeArg = values.type as string
  let profileType: ProfileType | undefined
  if (profileTypeArg !== 'auto') {
    if (!['cpu', 'heap', 'mutex', 'goroutine'].includes(profileTypeArg)) {
      console.error(`Error: Invalid profile type: ${profileTypeArg}`)
      console.error('Valid types: cpu, heap, mutex, goroutine, auto')
      process.exit(1)
    }
    profileType = profileTypeArg as ProfileType
  }

  try {
    const output = convert(profilePath, {
      format: formatLevel,
      profileType,
      profileName: basename(profilePath),
      sourceDir: values['source-dir'],
      includeSource: !values['no-source'],
      maxHotspots: parseInt(values['max-hotspots'] as string, 10)
    })

    if (values.output) {
      writeFileSync(values.output, output, 'utf-8')
      console.error(`Output written to ${values.output}`)
    } else {
      console.log(output)
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}

main()
