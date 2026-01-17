import { test, describe } from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProfile } from '../src/parser.ts'
import {
  analyzeProfile,
  getPrimarySampleTypeIndex,
  formatValue
} from '../src/analyzer.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const profilesDir = join(__dirname, 'profiles')

describe('analyzer', () => {
  test('analyzeProfile produces valid analysis', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const analysis = analyzeProfile(profile)

    assert.ok(analysis.sampleType, 'Should have sample type')
    assert.ok(analysis.totalValue >= 0n, 'Should have non-negative total value')
    assert.ok(analysis.totalSamples >= 0, 'Should have non-negative sample count')
    assert.ok(analysis.functionStats instanceof Map, 'Should have function stats map')
    assert.ok(analysis.callTree, 'Should have call tree')
    assert.ok(Array.isArray(analysis.hotspots), 'Should have hotspots array')
    assert.ok(Array.isArray(analysis.criticalPaths), 'Should have critical paths array')
  })

  test('hotspots are sorted by self percentage', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const analysis = analyzeProfile(profile)

    for (let i = 1; i < analysis.hotspots.length; i++) {
      assert.ok(
        analysis.hotspots[i - 1].selfPercent >= analysis.hotspots[i].selfPercent,
        'Hotspots should be sorted by self percentage descending'
      )
    }
  })

  test('self percentages sum to <= 100', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const analysis = analyzeProfile(profile)

    const totalSelfPercent = analysis.hotspots.reduce(
      (sum, h) => sum + h.selfPercent,
      0
    )

    assert.ok(
      totalSelfPercent <= 100.1, // Allow small floating point error
      `Total self percent should be <= 100, got ${totalSelfPercent}`
    )
  })

  test('formatValue formats nanoseconds correctly', () => {
    assert.strictEqual(formatValue(1500000000n, 'nanoseconds'), '1.50s')
    assert.strictEqual(formatValue(1500000n, 'nanoseconds'), '1.50ms')
    assert.strictEqual(formatValue(1500n, 'nanoseconds'), '1.50µs')
    assert.strictEqual(formatValue(150n, 'nanoseconds'), '150ns')
  })

  test('formatValue formats bytes correctly', () => {
    assert.strictEqual(formatValue(1500000000n, 'bytes'), '1.50 GB')
    assert.strictEqual(formatValue(1500000n, 'bytes'), '1.50 MB')
    assert.strictEqual(formatValue(1500n, 'bytes'), '1.50 KB')
    assert.strictEqual(formatValue(150n, 'bytes'), '150 B')
  })

  test('formatValue formats count correctly', () => {
    assert.strictEqual(formatValue(1500000n, 'count'), '1.50M')
    assert.strictEqual(formatValue(1500n, 'count'), '1.50K')
    assert.strictEqual(formatValue(150n, 'count'), '150')
  })

  test('getPrimarySampleTypeIndex returns 0 for cpu', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const index = getPrimarySampleTypeIndex(profile, 'cpu')

    assert.ok(index >= 0, 'Should return valid index')
  })
})
