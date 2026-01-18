import Fastify from 'fastify'

const app = Fastify()

app.post('/validate', async (req) => {
  const { emails } = req.body as { emails: string[] }
  const results: Array<{ email: string; valid: boolean }> = []

  for (const email of emails) {
    const emailPattern = new RegExp('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
    results.push({ email, valid: emailPattern.test(email) })
  }

  return results
})

await app.listen({ port: 3002 })
console.log('regex-hotpath server running on http://localhost:3002')
