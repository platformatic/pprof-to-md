/**
 * Generate test pprof profiles with known bottlenecks
 * Uses @datadog/pprof to create realistic profiles
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const profilesDir = join(__dirname, 'profiles')

// Ensure profiles directory exists
if (!existsSync(profilesDir)) {
  mkdirSync(profilesDir, { recursive: true })
}

// CPU-intensive workloads
function jsonHeavyWorkload(): void {
  const data = {
    users: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      metadata: { created: new Date().toISOString(), tags: ['a', 'b', 'c'] }
    }))
  }

  for (let i = 0; i < 10000; i++) {
    const json = JSON.stringify(data)
    JSON.parse(json)
  }
}

function regexHeavyWorkload(): void {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  const urlRegex =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/

  const testStrings = [
    'test@example.com',
    'invalid-email',
    'https://example.com/path?query=1',
    'not-a-url',
    'another.test@domain.org'
  ]

  for (let i = 0; i < 100000; i++) {
    for (const str of testStrings) {
      emailRegex.test(str)
      urlRegex.test(str)
    }
  }
}

function computeHeavyWorkload(): void {
  // Simulate various compute-bound operations
  const arr: number[] = []
  for (let i = 0; i < 10000; i++) {
    arr.push(Math.random())
  }

  for (let j = 0; j < 1000; j++) {
    arr.sort((a, b) => a - b)
    arr.map((x) => x * 2)
    arr.filter((x) => x > 0.5)
    arr.reduce((sum, x) => sum + x, 0)
  }
}

async function generateCpuProfile(): Promise<void> {
  try {
    const pprof = await import('@datadog/pprof')

    console.log('Starting CPU profile collection...')

    // Start profiling
    pprof.time.start({
      durationMillis: 5000,
      sourceMapper: undefined
    })

    // Run workloads
    console.log('Running JSON workload...')
    jsonHeavyWorkload()

    console.log('Running regex workload...')
    regexHeavyWorkload()

    console.log('Running compute workload...')
    computeHeavyWorkload()

    // Stop and get profile
    const profile = await pprof.time.stop()

    if (profile) {
      const outputPath = join(profilesDir, 'cpu-test.pb.gz')
      // Encode profile to protobuf and gzip
      const encoded = profile.encode()
      const gzipped = gzipSync(Buffer.from(encoded))
      writeFileSync(outputPath, gzipped)
      console.log(`CPU profile written to ${outputPath}`)
    }
  } catch (error) {
    console.error('Failed to generate CPU profile:', error)
    console.log('Make sure @datadog/pprof is installed: npm install')
  }
}

async function generateHeapProfile(): Promise<void> {
  try {
    const pprof = await import('@datadog/pprof')

    console.log('Starting heap profile collection...')

    // Start heap profiler first
    pprof.heap.start(512 * 1024, 64) // 512KB interval, 64 stack depth

    // Allocate some memory
    const allocations: unknown[] = []

    for (let i = 0; i < 1000; i++) {
      // Various allocation patterns
      allocations.push(Buffer.alloc(1024 * Math.floor(Math.random() * 100)))
      allocations.push({ data: 'x'.repeat(1000), index: i })
      allocations.push(Array.from({ length: 100 }, () => Math.random()))
    }

    // Get heap profile
    const profile = await pprof.heap.profile()

    if (profile) {
      const outputPath = join(profilesDir, 'heap-test.pb.gz')
      // Encode profile to protobuf and gzip
      const encoded = profile.encode()
      const gzipped = gzipSync(Buffer.from(encoded))
      writeFileSync(outputPath, gzipped)
      console.log(`Heap profile written to ${outputPath}`)
    }

    // Stop heap profiler
    pprof.heap.stop()

    // Keep allocations alive until profile is taken
    console.log(`Kept ${allocations.length} allocations alive`)
  } catch (error) {
    console.error('Failed to generate heap profile:', error)
    console.log('Make sure @datadog/pprof is installed: npm install')
  }
}

async function main(): Promise<void> {
  console.log('Generating test profiles...\n')

  await generateCpuProfile()
  console.log('')
  await generateHeapProfile()

  console.log('\nDone! Test profiles are in:', profilesDir)
}

main().catch(console.error)
