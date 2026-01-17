# pprof-to-llm: Design Plan

A tool to convert pprof profiling data into an LLM-friendly textual format for performance analysis and bottleneck identification.

## Questions & Answers

### Q1: What types of pprof profiles do you want to support?
**A:** CPU profiles and Memory profiles

### Q2: What programming language/runtime are you targeting?
**A:** Node.js primarily, but ideally any pprof-compatible collector

### Q3: What level of detail should the format preserve?
**A:** Design all levels (summarized, full, adaptive). Then create a testing plan to evaluate which would be the best.

### Q4: Should the format include source code context?
**A:** Both options - inline snippets and file:line references

### Q5: What's the typical size of profiles you'll be analyzing?
**A:** Generic tool that should work well independent of sample size

### Q6: What output actions should the LLM be guided toward?
**A:** Identify & explain bottlenecks (not necessarily suggest fixes)

### Q7: How should the format handle async/event-loop patterns?
**A:** Only sync stacks will be collected, no async stack handling needed

### Implementation Language
**TypeScript** with Node.js type stripping (native support in Node 22+/24)

### Libraries
- **Collection:** `@datadog/pprof`
- **Parsing:** `pprof-format`

---

## Design Philosophy

Inspired by **Brendan Gregg's** performance analysis principles:

1. **USE Method** (Utilization, Saturation, Errors) - Present metrics that answer "where is time being spent?" and "what resources are constrained?"

2. **Flame Graph Thinking** - Hierarchical representation of call stacks with width representing cost. Our textual format should preserve this hierarchy while being parseable by LLMs.

3. **Latency is King** - Focus on what's actually slow, not just what's called frequently. Distinguish between self-time and cumulative time.

4. **Context Matters** - A hot function isn't necessarily a problem if it's supposed to be hot. Provide enough context for informed analysis.

---

## Format Design: Three Detail Levels

### Level 1: Summary Format (`--format=summary`)

Compact, high-signal format for quick analysis. Best for initial triage.

```
=== PPROF ANALYSIS: CPU ===
Profile: api-server-cpu.pprof
Duration: 30s | Samples: 45,231 | Sample Rate: 100Hz

## TOP HOTSPOTS (by self-time)
┌─────┬──────────────────────────────────────────┬───────┬───────┬─────────────────────┐
│ Rank│ Function                                 │ Self% │ Cum%  │ Location            │
├─────┼──────────────────────────────────────────┼───────┼───────┼─────────────────────┤
│ 1   │ JSON.parse                               │ 23.4% │ 23.4% │ <native>            │
│ 2   │ processRequest                           │ 15.2% │ 67.8% │ src/handler.js:142  │
│ 3   │ RegExp.exec                              │ 12.1% │ 12.1% │ <native>            │
│ 4   │ validateSchema                           │ 8.7%  │ 31.2% │ src/validate.js:89  │
│ 5   │ Buffer.toString                          │ 6.3%  │ 6.3%  │ <native>            │
└─────┴──────────────────────────────────────────┴───────┴───────┴─────────────────────┘

## CRITICAL PATHS (top cumulative chains)
1. [67.8%] main → handleHTTP → processRequest → parseBody → JSON.parse
2. [31.2%] main → handleHTTP → processRequest → validateSchema → checkField
3. [18.4%] main → handleHTTP → processRequest → queryDB → pg.query

## KEY OBSERVATIONS
- Native JSON parsing dominates (23.4% self-time)
- Validation overhead is significant (31.2% cumulative)
- 3 distinct hot paths converge at processRequest
```

### Level 2: Detailed Format (`--format=detailed`)

Full context with annotated call trees. Best for deep analysis.

```
=== PPROF ANALYSIS: CPU ===
Profile: api-server-cpu.pprof
Duration: 30s | Samples: 45,231 | Sample Rate: 100Hz
Collected: 2024-01-15T14:32:00Z

## METADATA
- Node.js v20.10.0
- V8 11.3.244.8
- Platform: linux x64

## CALL TREE (annotated flame graph)
Legend: [self% | cum%] function @ location

[0.1% | 100%] (root)
└── [0.1% | 99.8%] main @ src/index.js:1
    └── [0.2% | 99.5%] startServer @ src/server.js:45
        └── [0.1% | 98.2%] handleHTTP @ src/server.js:78
            ├── [15.2% | 67.8%] processRequest @ src/handler.js:142    ◀ HOTSPOT
            │   ├── [1.2% | 24.6%] parseBody @ src/parser.js:23
            │   │   └── [23.4% | 23.4%] JSON.parse @ <native>          ◀ HOTSPOT
            │   ├── [8.7% | 31.2%] validateSchema @ src/validate.js:89 ◀ HOTSPOT
            │   │   ├── [12.1% | 12.1%] RegExp.exec @ <native>         ◀ HOTSPOT
            │   │   └── [2.3% | 10.4%] checkField @ src/validate.js:156
            │   └── [0.8% | 18.4%] queryDB @ src/db.js:67
            │       └── [4.2% | 17.6%] pg.query @ node_modules/pg/...
            └── [0.3% | 12.1%] sendResponse @ src/server.js:134
                └── [6.3% | 6.3%] Buffer.toString @ <native>

## FUNCTION DETAILS

### processRequest @ src/handler.js:142
Samples: 6,878 (15.2% self) | Cumulative: 30,678 (67.8%)
Callers: handleHTTP (100%)
Callees: parseBody (36%), validateSchema (46%), queryDB (27%)

This function is the main request processing entry point.
High self-time suggests work done directly in this function.

### JSON.parse @ <native>
Samples: 10,584 (23.4% self) | Cumulative: 10,584 (23.4%)
Callers: parseBody (100%)
Callees: none (leaf function)

Native V8 JSON parser. High cost suggests:
- Large JSON payloads being parsed
- Frequent parsing operations
- Consider streaming parser for large bodies

## HOTSPOT ANALYSIS

### Hotspot #1: JSON.parse (23.4%)
Type: Native function (cannot optimize directly)
Mitigation strategies:
- Reduce payload sizes
- Cache parsed results if payloads repeat
- Consider binary protocol (protobuf, msgpack)
- Stream large payloads instead of buffering

### Hotspot #2: processRequest (15.2% self)
Type: Application code
Location: src/handler.js:142
Requires source inspection to determine cause.

### Hotspot #3: RegExp.exec (12.1%)
Type: Native function
Called from: validateSchema
Mitigation strategies:
- Pre-compile RegExp patterns (move outside hot path)
- Simplify patterns if possible
- Consider string methods (.includes, .startsWith) for simple checks
```

### Level 3: Adaptive Format (`--format=adaptive`)

Starts with summary, provides structured drill-down markers.

```
=== PPROF ANALYSIS: CPU ===
Profile: api-server-cpu.pprof
Duration: 30s | Samples: 45,231

## EXECUTIVE SUMMARY
Primary bottleneck: JSON parsing (23.4% of CPU)
Secondary bottleneck: Schema validation (31.2% cumulative)
Optimization potential: HIGH (>50% in application code)

## TOP 5 HOTSPOTS
1. JSON.parse (23.4%) [DRILL:json-parse]
2. processRequest (15.2%) [DRILL:process-request]
3. RegExp.exec (12.1%) [DRILL:regexp-exec]
4. validateSchema (8.7%) [DRILL:validate-schema]
5. Buffer.toString (6.3%) [DRILL:buffer-tostring]

## DRILL-DOWN SECTIONS

[SECTION:json-parse]
### JSON.parse Analysis
Full path: handleHTTP → processRequest → parseBody → JSON.parse
Self-time: 23.4% (10,584 samples)
Nature: Native V8 function

Call context:
- Always called from parseBody()
- Processes incoming request bodies
- No caching observed in call pattern

Related source:
```javascript
// src/parser.js:23-28
async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body);  // ← 23.4% of total CPU
}
```
[/SECTION:json-parse]

[SECTION:process-request]
### processRequest Analysis
...
[/SECTION:process-request]
```

---

## Memory Profile Format

```
=== PPROF ANALYSIS: HEAP ===
Profile: api-server-heap.pprof
Snapshot: 2024-01-15T14:35:00Z

## HEAP SUMMARY
Total Allocated: 847.3 MB
Total Objects: 2,847,231
Top Growth: +234 MB in last 60s

## TOP ALLOCATORS (by size)
┌─────┬──────────────────────────────────────────┬──────────┬─────────┬─────────────────────┐
│ Rank│ Function                                 │ Size     │ Objects │ Location            │
├─────┼──────────────────────────────────────────┼──────────┼─────────┼─────────────────────┤
│ 1   │ JSON.parse                               │ 312.4 MB │ 892,341 │ <native>            │
│ 2   │ Buffer.from                              │ 156.2 MB │ 45,123  │ <native>            │
│ 3   │ createResponse                           │ 89.7 MB  │ 234,567 │ src/response.js:34  │
│ 4   │ clone                                    │ 67.3 MB  │ 445,892 │ node_modules/lodash │
│ 5   │ buildQuery                               │ 45.1 MB  │ 123,456 │ src/db.js:89        │
└─────┴──────────────────────────────────────────┴──────────┴─────────┴─────────────────────┘

## ALLOCATION PATTERNS

### High Object Count (potential GC pressure)
- clone: 445,892 objects (avg 151 bytes each) - consider in-place mutation
- anonymous closures: 234,123 objects - check for closure leaks

### Large Allocations (potential memory pressure)
- JSON.parse: 312.4 MB - large payloads or many small parses accumulating
- Buffer.from: 156.2 MB - buffer pooling may help

## RETENTION PATHS (for potential leaks)
1. global → cache → Map(45,000 entries) → parsed objects
2. global → eventEmitter → listeners[] → closures → captured scope
```

---

## Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        pprof-to-llm                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │   Parser    │───▶│   Analyzer   │───▶│   Formatter     │   │
│  │ pprof-format│    │              │    │                 │   │
│  │             │    │ - Aggregate  │    │ - Summary       │   │
│  │ - .pb       │    │ - Rank       │    │ - Detailed      │   │
│  │ - .pb.gz    │    │ - Annotate   │    │ - Adaptive      │   │
│  └─────────────┘    └──────────────┘    └─────────────────┘   │
│         │                  │                    │              │
│         ▼                  ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Profile Model                         │  │
│  │  - samples[]                                            │  │
│  │  - locations[]                                          │  │
│  │  - functions[]                                          │  │
│  │  - call tree (computed)                                 │  │
│  │  - hotspots (computed)                                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Source Resolver                         │  │
│  │  - Map file:line to source snippets                     │  │
│  │  - Optional: inline or reference mode                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Modules

1. **parser.js** - Parse pprof protobuf format using `pprof-format`
   - Handle gzipped and raw .pb files
   - Leverage pprof-format for protobuf decoding
   - Build sample → location → function mappings

2. **analyzer.js** - Process and analyze profile data
   - Build call tree from flat samples
   - Calculate self-time vs cumulative time
   - Identify hotspots (configurable threshold)
   - Detect patterns (loops, recursion, native calls)

3. **formatter.js** - Generate output formats
   - Summary formatter
   - Detailed formatter
   - Adaptive formatter with drill-down sections

4. **source-resolver.js** - Optional source code context
   - Read source files from disk
   - Extract relevant snippets around hot lines
   - Handle source maps for transpiled code

### CLI Interface

```bash
# Basic usage
pprof-to-llm profile.pb.gz

# With format selection
pprof-to-llm --format=detailed profile.pb.gz

# With source context
pprof-to-llm --format=adaptive --source-dir=./src profile.pb.gz

# Memory profile
pprof-to-llm --type=heap heap.pb.gz

# Output to file
pprof-to-llm profile.pb.gz -o analysis.txt
```

---

## Testing Plan

### Objective
Evaluate which format level (Summary, Detailed, Adaptive) produces the best LLM analysis results.

### Test Methodology

#### 1. Test Profiles
Create/collect profiles with known bottlenecks using `@datadog/pprof`:

| Profile | Description | Known Hotspots |
|---------|-------------|----------------|
| cpu-json-heavy | Heavy JSON parsing workload | JSON.parse (>40%) |
| cpu-regex | Regex validation bottleneck | RegExp.exec, validateEmail |
| cpu-db | Database query bottleneck | pg.query, serialize |
| cpu-balanced | Multiple moderate hotspots | 5 functions at ~10% each |
| heap-leak | Memory leak scenario | Growing cache, closures |
| heap-churn | High allocation rate | Buffer creation, object copies |

#### 2. Evaluation Criteria

For each format × profile combination, evaluate:

| Criterion | Weight | Measurement |
|-----------|--------|-------------|
| **Hotspot Identification** | 30% | Did LLM correctly identify top 3 hotspots? |
| **Root Cause Understanding** | 25% | Did LLM explain WHY these are bottlenecks? |
| **Actionability** | 20% | Did LLM provide useful optimization hints? |
| **Context Utilization** | 15% | Did LLM use provided context effectively? |
| **Token Efficiency** | 10% | Analysis quality per input token |

#### 3. Test Protocol

```
For each profile P in test_profiles:
    For each format F in [summary, detailed, adaptive]:
        1. Generate output: pprof-to-llm --format=F P > output.txt
        2. Count tokens: tokens = count_tokens(output.txt)
        3. Submit to LLM with standard prompt:
           "Analyze this profile and identify the main performance
            bottlenecks. Explain what's causing them and suggest
            investigation priorities."
        4. Score LLM response against criteria
        5. Record: (P, F, tokens, scores)
```

#### 4. Test Prompts

**Standard Analysis Prompt:**
```
Below is a performance profile analysis. Please:
1. Identify the top 3 performance bottlenecks
2. Explain what is likely causing each bottleneck
3. Prioritize which should be investigated first and why

[PROFILE OUTPUT]
```

**Drill-Down Prompt (for adaptive format):**
```
Based on your initial analysis, you identified [HOTSPOT] as a concern.
Here is detailed information for that section:

[DRILL-DOWN SECTION]

What specific optimizations would you recommend?
```

#### 5. Expected Outcomes

| Format | Strengths | Weaknesses |
|--------|-----------|------------|
| Summary | Fast, low tokens, good for triage | May miss nuance, limited context |
| Detailed | Complete picture, source context | High token count, may overwhelm |
| Adaptive | Best of both, progressive detail | More complex to process |

#### 6. Success Metrics

- **Minimum accuracy**: LLM correctly identifies #1 hotspot in >90% of tests
- **Context value**: Detailed/Adaptive score >20% higher on root cause understanding
- **Efficiency**: Summary achieves >70% of Detailed quality at <30% token cost

---

## File Structure

```
pprof-to-llm/
├── package.json
├── tsconfig.json
├── README.md
├── PLAN.md (this file)
├── src/
│   ├── cli.ts             # CLI entry point
│   ├── index.ts           # Library exports
│   ├── parser.ts          # pprof parsing via pprof-format
│   ├── analyzer.ts        # Profile analysis logic
│   ├── formatter/
│   │   ├── index.ts       # Formatter factory
│   │   ├── summary.ts     # Summary format
│   │   ├── detailed.ts    # Detailed format
│   │   └── adaptive.ts    # Adaptive format
│   ├── source-resolver.ts # Source code lookup
│   └── types.ts           # Shared type definitions
├── test/
│   ├── profiles/          # Test profile files
│   ├── parser.test.ts
│   ├── analyzer.test.ts
│   └── formatter.test.ts
└── examples/
    ├── sample-cpu.pb.gz
    └── sample-heap.pb.gz
```

---

## Dependencies

```json
{
  "dependencies": {
    "pprof-format": "^2.1.0"
  },
  "devDependencies": {
    "@datadog/pprof": "^5.4.1",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

- **pprof-format** - Parse pprof protobuf files
- **@datadog/pprof** - Generate test profiles (dev dependency)
- **typescript** - Type checking only (runtime uses Node.js native type stripping)

Use Node.js built-in modules where possible (zlib, fs, path).

### TypeScript Configuration

Uses Node.js native type stripping (`--experimental-strip-types` in Node 22, default in Node 24+).
No build step required - TypeScript files run directly.

---

## Next Steps

1. **Phase 1**: Implement parser using `pprof-format`
2. **Phase 2**: Implement analyzer with call tree construction
3. **Phase 3**: Implement all three formatters
4. **Phase 4**: Add source resolution capability
5. **Phase 5**: Execute testing plan and document results
6. **Phase 6**: Refine formats based on test results

---

## References

- [pprof-format npm](https://www.npmjs.com/package/pprof-format)
- [@datadog/pprof npm](https://www.npmjs.com/package/@datadog/pprof)
- [pprof format specification](https://github.com/google/pprof/blob/main/proto/profile.proto)
- [Brendan Gregg - Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
- [Brendan Gregg - USE Method](https://www.brendangregg.com/usemethod.html)
