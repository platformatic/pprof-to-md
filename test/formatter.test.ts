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
  test('formatSummary produces expected structure', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatSummary(analysis, profileType, { profileName: 'test.pb' })

    assert.ok(output.includes('=== PPROF ANALYSIS:'), 'Should have header')
    assert.ok(output.includes('## TOP HOTSPOTS'), 'Should have hotspots section')
    assert.ok(output.includes('## KEY OBSERVATIONS'), 'Should have observations')
  })

  test('formatDetailed produces expected structure', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatDetailed(analysis, profileType)

    assert.ok(output.includes('=== PPROF ANALYSIS:'), 'Should have header')
    assert.ok(output.includes('## METADATA'), 'Should have metadata section')
    assert.ok(output.includes('## CALL TREE'), 'Should have call tree')
    assert.ok(output.includes('## FUNCTION DETAILS'), 'Should have function details')
    assert.ok(output.includes('## HOTSPOT ANALYSIS'), 'Should have hotspot analysis')
  })

  test('formatAdaptive produces expected structure', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatAdaptive(analysis, profileType)

    assert.ok(output.includes('=== PPROF ANALYSIS:'), 'Should have header')
    assert.ok(output.includes('## EXECUTIVE SUMMARY'), 'Should have executive summary')
    assert.ok(output.includes('## TOP HOTSPOTS'), 'Should have hotspots list')
    assert.ok(output.includes('[DRILL:'), 'Should have drill-down markers')
    assert.ok(output.includes('[SECTION:'), 'Should have drill-down sections')
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

    assert.ok(summaryOutput.includes('TOP HOTSPOTS'), 'Summary should have hotspots table')
    assert.ok(detailedOutput.includes('CALL TREE'), 'Detailed should have call tree')
    assert.ok(adaptiveOutput.includes('EXECUTIVE SUMMARY'), 'Adaptive should have executive summary')
  })

  test('formatSummary table is well-formed', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const profileType = detectProfileType(profile)
    const analysis = analyzeProfile(profile)
    const output = formatSummary(analysis, profileType)

    // Check table structure
    assert.ok(output.includes('┌'), 'Should have table top border')
    assert.ok(output.includes('└'), 'Should have table bottom border')
    assert.ok(output.includes('│'), 'Should have table columns')
    assert.ok(output.includes('Rank'), 'Should have Rank header')
    assert.ok(output.includes('Function'), 'Should have Function header')
    assert.ok(output.includes('Self%'), 'Should have Self% header')
    assert.ok(output.includes('Cum%'), 'Should have Cum% header')
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
})
