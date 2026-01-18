import Fastify from 'fastify'

const app = Fastify()

interface Item {
  id: number
  name: string
  value: number
}

app.post('/dedupe', async (req) => {
  const items: Item[] = req.body as Item[]
  const unique: Item[] = []

  for (const item of items) {
    let exists = false
    for (const u of unique) {
      if (u.id === item.id) {
        exists = true
        break
      }
    }
    if (!exists) {
      unique.push(item)
    }
  }

  return unique
})

await app.listen({ port: 3005 })
console.log('quadratic-algo server running on http://localhost:3005')
