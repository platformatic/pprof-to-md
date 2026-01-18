import Fastify from 'fastify'
import { writeFileSync } from 'fs'
import { gzipSync } from 'zlib'

const pprof = await import('@datadog/pprof')
pprof.time.start({ durationMillis: 15000 })

const app = Fastify()

app.post('/validate', async (req) => {
  const { emails } = req.body as { emails: string[] }
  const results: Array<{ email: string; valid: boolean }> = []

  for (const email of emails) {
    // BOTTLENECK: Creates a new RegExp object on every iteration
    const emailPattern = new RegExp('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
    results.push({ email, valid: emailPattern.test(email) })
  }

  return results
})

await app.listen({ port: 3002 })
console.log('Profiled regex-hotpath server running on http://localhost:3002')

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
