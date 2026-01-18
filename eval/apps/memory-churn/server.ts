import Fastify from 'fastify'

const app = Fastify()

interface Item {
  id: number
  value: number
  category: string
}

app.post('/transform', async (req) => {
  let data: Item[] = req.body as Item[]

  data = data.map(x => ({ ...x, processed: true }))
  data = data.filter(x => x.value > 10)
  data = data.map(x => ({ ...x, doubled: x.value * 2 }))
  data = data.filter(x => x.value < 900)

  return data
})

await app.listen({ port: 3004 })
console.log('memory-churn server running on http://localhost:3004')
