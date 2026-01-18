import autocannon from 'autocannon'

// Generate 500 items with ~50% duplicates to trigger the O(n²) behavior
const items = Array.from({ length: 500 }, (_, i) => ({
  id: i % 300,  // Creates duplicates
  name: `Item ${i}`,
  value: Math.floor(Math.random() * 1000)
}))

const body = JSON.stringify(items)

const result = await autocannon({
  url: 'http://localhost:3005/dedupe',
  duration: 10,
  connections: 10,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body
})

console.log(autocannon.printResult(result))
