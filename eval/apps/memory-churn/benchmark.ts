import autocannon from 'autocannon'

// Generate a large payload with 1000 items
const items = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  value: Math.floor(Math.random() * 1000),
  category: `category-${i % 10}`
}))

const body = JSON.stringify(items)

const result = await autocannon({
  url: 'http://localhost:3004/transform',
  duration: 10,
  connections: 10,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body
})

console.log(autocannon.printResult(result))
