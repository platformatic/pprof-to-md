import { test, describe } from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProfile, detectProfileType } from '../src/parser.ts'
import { analyzeProfile, getPrimarySampleTypeIndex } from '../src/analyzer.ts'
import {
  format,
  formatSummary,
  formatDetailed,
  formatAdaptive
} from '../src/formatter/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const profilesDir = join(__dirname, 'profiles')

describe('formatter', () => {
  test('formatSummary produces expected markdown structure', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatSummary(analysis, profileType, { profileName: 'test.pb' })

    assert.ok(output.includes('# PPROF Analysis:'), 'Should have markdown header')
    assert.ok(output.includes('## Top Hotspots'), 'Should have hotspots section')
    assert.ok(output.includes('## Key Observations'), 'Should have observations')
  })

  test('formatDetailed produces expected markdown structure', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatDetailed(analysis, profileType)

    assert.ok(output.includes('# PPROF Analysis:'), 'Should have markdown header')
    assert.ok(output.includes('## Metadata'), 'Should have metadata section')
    assert.ok(output.includes('## Call Tree'), 'Should have call tree')
    assert.ok(output.includes('## Function Details'), 'Should have function details')
    assert.ok(output.includes('## Hotspot Analysis'), 'Should have hotspot analysis')
  })

  test('formatAdaptive produces expected markdown structure', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatAdaptive(analysis, profileType)

    assert.ok(output.includes('# PPROF Analysis:'), 'Should have markdown header')
    assert.ok(output.includes('## Executive Summary'), 'Should have executive summary')
    assert.ok(output.includes('## Top Hotspots'), 'Should have hotspots list')
    assert.ok(output.includes('[Details](#'), 'Should have drill-down links')
    assert.ok(output.includes('<a id="'), 'Should have anchor tags for drill-down')
  })

  test('format function routes to correct formatter', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)

    const summaryOutput = format(analysis, profileType, 'summary')
    const detailedOutput = format(analysis, profileType, 'detailed')
    const adaptiveOutput = format(analysis, profileType, 'adaptive')

    assert.ok(summaryOutput.includes('Top Hotspots'), 'Summary should have hotspots table')
    assert.ok(detailedOutput.includes('Call Tree'), 'Detailed should have call tree')
    assert.ok(adaptiveOutput.includes('Executive Summary'), 'Adaptive should have executive summary')
  })

  test('formatSummary table is well-formed markdown', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatSummary(analysis, profileType)

    // Check markdown table structure
    assert.ok(output.includes('| Rank |'), 'Should have Rank column')
    assert.ok(output.includes('| Function |'), 'Should have Function column')
    assert.ok(output.includes('| Self% |'), 'Should have Self% column')
    assert.ok(output.includes('| Cum% |'), 'Should have Cum% column')
    assert.ok(output.includes('|---'), 'Should have table separator row')
  })

  test('output includes percentage signs', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)

    for (const level of ['summary', 'detailed', 'adaptive'] as const) {
      const output = format(analysis, profileType, level)
      assert.ok(output.includes('%'), `${level} format should include percentages`)
    }
  })

  test('output uses markdown formatting', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)

    for (const level of ['summary', 'detailed', 'adaptive'] as const) {
      const output = format(analysis, profileType, level)
      assert.ok(output.includes('**'), `${level} format should use bold markdown`)
      assert.ok(output.includes('`'), `${level} format should use code markdown`)
      assert.ok(output.startsWith('#'), `${level} format should start with heading`)
    }
  })
})
