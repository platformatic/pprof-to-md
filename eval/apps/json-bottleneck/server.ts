import Fastify from 'fastify'
import { readFileSync } from 'fs'

const app = Fastify()

app.get('/config/:key', async (req) => {
  const { key } = req.params as { key: string }
  const config = JSON.parse(readFileSync('./config.json', 'utf-8'))
  return { value: config[key] ?? null }
})

await app.listen({ port: 3001 })
console.log('json-bottleneck server running on http://localhost:3001')
