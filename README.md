# pprof-to-md

Convert pprof profiling data into Markdown format for LLM-assisted performance analysis.

## Overview

`pprof-to-md` transforms binary pprof profiles into structured Markdown that LLMs can analyze to identify performance bottlenecks, explain root causes, and suggest optimizations.

## Installation

```bash
npm install pprof-to-md
```

Or run directly:

```bash
npx pprof-to-md profile.pb.gz
```

## Usage

### CLI

```bash
# Basic usage - analyze a CPU profile
pprof-to-md cpu-profile.pb.gz

# Output to file
pprof-to-md profile.pb.gz -o analysis.md

# Detailed format with full call tree
pprof-to-md --format=detailed profile.pb.gz

# Summary format for quick triage
pprof-to-md --format=summary profile.pb.gz

# Memory profile analysis
pprof-to-md --type=heap heap-profile.pb.gz
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format` | Output format: `summary`, `detailed`, `adaptive` | `adaptive` |
| `-t, --type` | Profile type: `cpu`, `heap`, `auto` | `auto` |
| `-o, --output` | Output file (stdout if not specified) | - |
| `-s, --source-dir` | Source directory for code context | - |
| `--no-source` | Disable source code inclusion | `false` |
| `--max-hotspots` | Maximum hotspots to show | `10` |

### Programmatic API

```typescript
import { convert } from 'pprof-to-md'

const markdown = convert('profile.pb.gz', {
  format: 'adaptive',
  profileType: 'cpu',
  maxHotspots: 10
})

console.log(markdown)
```

## Output Formats

### Summary

Compact format for quick triage:

```markdown
# PPROF Analysis: CPU

**Profile:** `profile.pb.gz`
**Duration:** 30s | **Samples:** 45,231

## Top Hotspots (by self-time)

| Rank | Function | Self% | Cum% | Location |
|------|----------|-------|------|----------|
| 1 | `JSON.parse` | 23.4% | 23.4% | `<native>` |
| 2 | `processRequest` | 15.2% | 67.8% | `handler.ts:142` |

## Key Observations

- Native `JSON.parse` dominates (**23.4%** self-time)
```

### Detailed

Full context with annotated call trees:

```markdown
## Call Tree (annotated flame graph)

> Legend: `[self% | cum%] function @ location`

[  0.1% | 100.0%] (root)
└── [ 15.2% |  67.8%] processRequest @ handler.ts:142  ◀ HOTSPOT
    └── [ 23.4% |  23.4%] JSON.parse @ <native>  ◀ HOTSPOT

## Function Details

### `processRequest` @ `handler.ts:142`

**Samples:** 6,878 (15.2% self) | **Cumulative:** 30,678 (67.8%)
**Callers:** `handleHTTP`
**Callees:** `parseBody`, `validateSchema`
```

### Adaptive (Default)

Summary with drill-down sections and anchor links:

```markdown
## Executive Summary

- **Primary bottleneck:** `JSON.parse` (**23.4%** of CPU)
- **Optimization potential:** 🟢 HIGH (67% in application code)

## Top Hotspots

1. `JSON.parse` (**23.4%**) → [Details](#json-parse)
2. `processRequest` (**15.2%**) → [Details](#processrequest)

---

## Detailed Analysis

<a id="json-parse"></a>

### `JSON.parse`

**Call path:** `handleHTTP` → `processRequest` → `parseBody` → `JSON.parse`
**Self-time:** 23.4% (10,584 samples)
```

## Collecting Profiles

### Node.js with @datadog/pprof

```typescript
import * as pprof from '@datadog/pprof'
import { writeFileSync } from 'fs'
import { gzipSync } from 'zlib'

// CPU profiling
pprof.time.start({ durationMillis: 30000 })
// ... run workload ...
const profile = await pprof.time.stop()
writeFileSync('cpu.pb.gz', gzipSync(profile.encode()))

// Heap profiling
pprof.heap.start(512 * 1024, 64)
// ... run workload ...
const heapProfile = await pprof.heap.profile()
writeFileSync('heap.pb.gz', gzipSync(heapProfile.encode()))
```

## Requirements

- Node.js >= 22.0.0 (uses native TypeScript support)

## License

Apache-2.0
