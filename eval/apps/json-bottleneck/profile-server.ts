import Fastify from 'fastify'
import { readFileSync, writeFileSync } from 'fs'
import { gzipSync } from 'zlib'

// Start profiler
const pprof = await import('@datadog/pprof')
pprof.time.start({ durationMillis: 15000 })

const app = Fastify()

app.get('/config/:key', async (req) => {
  const { key } = req.params as { key: string }
  // BOTTLENECK: Reads and parses 1MB JSON on every single request
  const config = JSON.parse(readFileSync('./config.json', 'utf-8'))
  return { value: config[key] ?? null }
})

await app.listen({ port: 3001 })
console.log('Profiled server running on http://localhost:3001')
console.log('Profile will be collected for 15 seconds...')

// Stop profiler after duration and save
setTimeout(async () => {
  const profile = await pprof.time.stop()
  if (profile) {
    const encoded = profile.encode()
    const gzipped = gzipSync(Buffer.from(encoded))
    writeFileSync('./profile.pb.gz', gzipped)
    console.log('Profile saved to profile.pb.gz')
  }
  process.exit(0)
}, 16000)
