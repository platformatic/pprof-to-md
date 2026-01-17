# Eval Plan: LLM Performance Optimization

## Overview

This eval tests whether an LLM can successfully identify and fix performance bottlenecks using pprof-to-llm output. The orchestration is performed by Claude (the outer agent), which spawns inner subagents to attempt optimizations.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude (Outer Agent)                         │
│                                                                 │
│  For each test app:                                             │
│    1. Start app                                                 │
│    2. Run baseline benchmark (autocannon)                       │
│    3. Collect pprof profile during load                         │
│    4. Convert profile → pprof-to-llm                            │
│    5. ┌──────────────────────────────────────────┐              │
│       │  Spawn Subagent (Task tool)              │              │
│       │  - Receives: profile output + source     │              │
│       │  - Task: identify bottleneck, fix code   │              │
│       │  - Returns: fixed source code            │              │
│       └──────────────────────────────────────────┘              │
│    6. Apply fix from subagent                                   │
│    7. Run post-fix benchmark                                    │
│    8. Score: improvement ratio, pass/fail                       │
│                                                                 │
│  Generate final report                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Applications

Five minimal Fastify HTTP servers, each with one intentional performance problem.

### 1. json-bottleneck

**Problem:** Parsing a large JSON config file on every request.

```typescript
// eval/apps/json-bottleneck/server.ts
import Fastify from 'fastify'
import { readFileSync } from 'fs'

const app = Fastify()

app.get('/config/:key', async (req) => {
  // BOTTLENECK: Reads and parses JSON on every request
  const config = JSON.parse(readFileSync('./config.json', 'utf-8'))
  return { value: config[req.params.key] }
})

await app.listen({ port: 3001 })
```

**Expected fix:** Move `readFileSync` + `JSON.parse` outside the handler.
**Expected improvement:** >10x throughput

---

### 2. regex-hotpath

**Problem:** Creating RegExp objects inside a loop.

```typescript
// eval/apps/regex-hotpath/server.ts
import Fastify from 'fastify'

const app = Fastify()

app.post('/validate', async (req) => {
  const emails: string[] = req.body.emails
  const results = []

  for (const email of emails) {
    // BOTTLENECK: New RegExp created on every iteration
    const pattern = new RegExp('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
    results.push({ email, valid: pattern.test(email) })
  }

  return results
})

await app.listen({ port: 3002 })
```

**Expected fix:** Move regex outside loop or use literal `/pattern/`.
**Expected improvement:** >5x throughput

---

### 3. n-plus-one

**Problem:** Sequential async calls that could be parallelized.

```typescript
// eval/apps/n-plus-one/server.ts
import Fastify from 'fastify'

const app = Fastify()

async function fetchUser(id: number) {
  await new Promise(r => setTimeout(r, 10)) // Simulate 10ms DB latency
  return { id, name: `User ${id}` }
}

app.get('/users', async () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const users = []

  // BOTTLENECK: Sequential awaits = 100ms total
  for (const id of ids) {
    const user = await fetchUser(id)
    users.push(user)
  }

  return users
})

await app.listen({ port: 3003 })
```

**Expected fix:** Use `Promise.all()` to parallelize.
**Expected improvement:** >5x latency reduction

---

### 4. memory-churn

**Problem:** Creating unnecessary intermediate arrays.

```typescript
// eval/apps/memory-churn/server.ts
import Fastify from 'fastify'

const app = Fastify()

app.post('/transform', async (req) => {
  let data: Array<{ value: number }> = req.body.items

  // BOTTLENECK: 4 intermediate arrays created
  data = data.map(x => ({ ...x, step1: true }))
  data = data.filter(x => x.value > 0)
  data = data.map(x => ({ ...x, step2: true }))
  data = data.filter(x => x.value < 1000)

  return data
})

await app.listen({ port: 3004 })
```

**Expected fix:** Single pass with reduce or combined filter/map.
**Expected improvement:** >2x throughput, reduced GC pressure

---

### 5. quadratic-algo

**Problem:** O(n²) deduplication that should be O(n).

```typescript
// eval/apps/quadratic-algo/server.ts
import Fastify from 'fastify'

const app = Fastify()

app.post('/dedupe', async (req) => {
  const items: Array<{ id: number }> = req.body.items
  const unique: typeof items = []

  // BOTTLENECK: O(n²) nested loop
  for (const item of items) {
    let exists = false
    for (const u of unique) {
      if (u.id === item.id) {
        exists = true
        break
      }
    }
    if (!exists) unique.push(item)
  }

  return unique
})

await app.listen({ port: 3005 })
```

**Expected fix:** Use `Map` or `Set` for O(1) lookup.
**Expected improvement:** >10x throughput for large inputs

---

## Eval Flow (Step by Step)

For each test app, I (Claude) will execute:

### Step 1: Setup
```bash
cd eval/apps/{app-name}
npm install
```

### Step 2: Start App
```bash
node server.ts &
APP_PID=$!
```

### Step 3: Baseline Benchmark
```bash
npx autocannon -d 10 -c 10 http://localhost:{port}/{endpoint}
```
Record: `baseline_rps`, `baseline_latency_p99`

### Step 4: Profile Collection
```bash
# Start app with profiling enabled, run load, collect profile
node --require @datadog/pprof server.ts &
npx autocannon -d 10 http://localhost:{port}/{endpoint}
# Profile saved to profile.pb.gz
```

### Step 5: Convert Profile
```bash
node ../../src/cli.ts profile.pb.gz > profile-analysis.md
```

### Step 6: Spawn Optimizer Subagent

Use the Task tool with:
- **subagent_type:** `general-purpose`
- **prompt:**
  ```
  You are a performance optimization expert.

  ## Profile Analysis
  {contents of profile-analysis.md}

  ## Source Code
  {contents of server.ts}

  ## Task
  1. Identify the performance bottleneck
  2. Explain why it's slow
  3. Provide a fixed version of server.ts

  Return ONLY the complete fixed server.ts code.
  ```

### Step 7: Apply Fix
Write the subagent's response to `server.ts`

### Step 8: Post-Fix Benchmark
```bash
node server.ts &
npx autocannon -d 10 -c 10 http://localhost:{port}/{endpoint}
```
Record: `postfix_rps`, `postfix_latency_p99`

### Step 9: Score
```
improvement = postfix_rps / baseline_rps
passed = improvement >= expected_improvement
```

---

## Scoring Criteria

| Metric | Description |
|--------|-------------|
| **Bottleneck Identified** | Did subagent correctly name the problem? |
| **Code Compiles** | Does the fix run without errors? |
| **Tests Pass** | Does the fix maintain correctness? |
| **Performance Improved** | Is `postfix_rps > baseline_rps`? |
| **Met Target** | Is `improvement >= expected`? |

---

## Expected Results

| App | Expected Δ | Difficulty |
|-----|------------|------------|
| json-bottleneck | >10x | Easy |
| regex-hotpath | >5x | Easy |
| n-plus-one | >5x | Medium |
| memory-churn | >2x | Medium |
| quadratic-algo | >10x | Easy |

**Target pass rate:** ≥80% (4/5)

---

## Directory Structure

```
eval/
├── apps/
│   ├── json-bottleneck/
│   │   ├── server.ts
│   │   ├── config.json
│   │   └── package.json
│   ├── regex-hotpath/
│   │   ├── server.ts
│   │   └── package.json
│   ├── n-plus-one/
│   │   ├── server.ts
│   │   └── package.json
│   ├── memory-churn/
│   │   ├── server.ts
│   │   └── package.json
│   └── quadratic-algo/
│       ├── server.ts
│       └── package.json
└── results/
    └── {timestamp}-eval-report.md
```

---

## Dependencies

Each app's `package.json`:
```json
{
  "type": "module",
  "dependencies": {
    "fastify": "^4.26.0"
  },
  "devDependencies": {
    "@datadog/pprof": "^5.4.1",
    "autocannon": "^7.15.0"
  }
}
```

---

## Implementation Phases

### Phase 1: Create Test Apps
- [ ] json-bottleneck
- [ ] regex-hotpath
- [ ] n-plus-one
- [ ] memory-churn
- [ ] quadratic-algo

### Phase 2: Run Eval
- [ ] Execute eval flow for each app
- [ ] Record all metrics
- [ ] Collect subagent responses

### Phase 3: Report
- [ ] Generate summary table
- [ ] Document what worked/failed
- [ ] Note any prompt refinements needed

---

## Notes

- The outer agent (me) handles all orchestration via Bash and Task tools
- No automation code needed - I execute each step manually
- Subagents see only the profile output and source code, not the "answer"
- Each eval is independent - failures don't block subsequent tests
