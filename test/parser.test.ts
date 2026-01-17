import { test, describe } from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProfile, detectProfileType } from '../src/parser.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const profilesDir = join(__dirname, 'profiles')

describe('parser', () => {
  test('parseProfile handles missing file gracefully', () => {
    assert.throws(
      () => parseProfile('/nonexistent/profile.pb'),
      /ENOENT/
    )
  })

  test('parseProfile parses CPU profile if available', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found. Run npm run generate-profiles first.')
      return
    }

    const profile = parseProfile(cpuProfile)

    assert.ok(profile.sampleTypes.length > 0, 'Should have sample types')
    assert.ok(profile.samples.length > 0, 'Should have samples')
    assert.ok(profile.functions.size > 0, 'Should have functions')
    assert.ok(profile.locations.size > 0, 'Should have locations')
  })

  test('parseProfile parses heap profile if available', async () => {
    const heapProfile = join(profilesDir, 'heap-test.pb.gz')

    if (!existsSync(heapProfile)) {
      console.log('Skipping: heap-test.pb.gz not found. Run npm run generate-profiles first.')
      return
    }

    const profile = parseProfile(heapProfile)

    assert.ok(profile.sampleTypes.length > 0, 'Should have sample types')
    assert.ok(profile.samples.length >= 0, 'Should have samples array')
  })

  test('detectProfileType identifies CPU profile', async () => {
    const cpuProfile = join(profilesDir, 'cpu-test.pb.gz')

    if (!existsSync(cpuProfile)) {
      console.log('Skipping: cpu-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(cpuProfile)
    const type = detectProfileType(profile)

    assert.strictEqual(type, 'cpu', 'Should detect as CPU profile')
  })

  test('detectProfileType identifies heap profile', async () => {
    const heapProfile = join(profilesDir, 'heap-test.pb.gz')

    if (!existsSync(heapProfile)) {
      console.log('Skipping: heap-test.pb.gz not found.')
      return
    }

    const profile = parseProfile(heapProfile)
    const type = detectProfileType(profile)

    assert.strictEqual(type, 'heap', 'Should detect as heap profile')
  })
})
