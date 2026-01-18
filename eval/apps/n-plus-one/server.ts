import Fastify from 'fastify'

const app = Fastify()

async function fetchUser(id: number): Promise<{ id: number; name: string }> {
  await new Promise(resolve => setTimeout(resolve, 10))
  return { id, name: `User ${id}` }
}

async function fetchUserPosts(userId: number): Promise<Array<{ id: number; title: string }>> {
  await new Promise(resolve => setTimeout(resolve, 10))
  return [
    { id: userId * 100 + 1, title: `Post 1 by user ${userId}` },
    { id: userId * 100 + 2, title: `Post 2 by user ${userId}` }
  ]
}

app.get('/users-with-posts', async () => {
  const userIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const results: Array<{ user: { id: number; name: string }; posts: Array<{ id: number; title: string }> }> = []

  for (const id of userIds) {
    const user = await fetchUser(id)
    const posts = await fetchUserPosts(id)
    results.push({ user, posts })
  }

  return results
})

await app.listen({ port: 3003 })
console.log('n-plus-one server running on http://localhost:3003')
