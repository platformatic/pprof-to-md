# Eval Report: LLM Performance Optimization

## Overview

This eval tested whether an LLM subagent could identify and fix performance bottlenecks using pprof-to-llm output. The outer agent (Claude) orchestrated the process: running benchmarks, collecting profiles, spawning optimization subagents, applying fixes, and measuring results.

## Results Summary

| App | Baseline | Post-Fix | Throughput Δ | Latency Δ | Target | Result |
|-----|----------|----------|--------------|-----------|--------|--------|
| **json-bottleneck** | 8 req/s | 1,122 req/s | **144x** | 143x | >10x | ✅ PASS |
| **regex-hotpath** | 467 req/s | 553 req/s | 1.18x | - | >5x | ❌ FAIL |
| **n-plus-one** | 41 req/s | 526 req/s | **12.8x** | 13.4x | >5x | ✅ PASS |
| **memory-churn** | 124 req/s | 158 req/s | 1.27x | **84x** | >2x | ⚠️ PARTIAL |
| **quadratic-algo** | 137 req/s | 269 req/s | 1.96x | **127x** | >10x | ⚠️ PARTIAL |

### Metrics

- **Throughput targets met:** 2/5 (40%)
- **Correct fix identified:** 5/5 (100%)
- **Latency improved:** 5/5 (100%)

---

## Detailed Results

### 1. json-bottleneck ✅

**Problem:** Parsing a 1MB JSON config file on every request.

**Baseline:** 8 req/s, 1,203ms latency

**Profile showed:**
- `(anonymous:L#11:C#25)` at 71.1% - route handler
- `readFileSync` at 10.7%
- `readFileUtf8` at 8.1%

**Subagent fix:** Moved `JSON.parse(readFileSync(...))` outside the request handler to load config once at startup.

**Post-fix:** 1,122 req/s, 8.4ms latency

**Improvement:** 144x throughput, 143x latency

---

### 2. regex-hotpath ❌

**Problem:** Creating new RegExp objects inside a loop.

**Baseline:** 467 req/s, 658ms latency

**Profile showed:**
- `writev` at 48.1% - response I/O dominated
- `RegExp` pattern at only 1.4%

**Subagent fix:** Moved regex pattern outside the loop as a constant.

**Post-fix:** 553 req/s, 17.6ms latency

**Improvement:** 1.18x throughput

**Analysis:** The regex creation overhead was masked by I/O operations. The workload (100 emails) wasn't large enough to make the regex bottleneck dominant. The fix was correct but didn't produce measurable throughput improvement due to I/O being the actual bottleneck.

---

### 3. n-plus-one ✅

**Problem:** Sequential async calls in a loop (N+1 query pattern).

**Baseline:** 41 req/s, 242ms latency

**Profile:** CPU profiling doesn't capture async wait time. Diagnosis was based on code analysis and latency measurements (10 users × 2 queries × 10ms = 200ms expected).

**Subagent fix:** Used `Promise.all()` to parallelize all queries.

**Post-fix:** 526 req/s, 18ms latency

**Improvement:** 12.8x throughput, 13.4x latency

---

### 4. memory-churn ⚠️

**Problem:** Creating 4 intermediate arrays with spread copies.

**Baseline:** 124 req/s, 5,239ms latency (with timeouts)

**Subagent fix:** Combined all operations into a single loop pass, eliminating intermediate arrays.

**Post-fix:** 158 req/s, 62ms latency (no errors)

**Improvement:** 1.27x throughput, 84x latency

**Analysis:** The fix was correct (latency improved 84x). However, baseline had many timeouts which inflated the req/s metric artificially. The throughput comparison is misleading; latency is the better success indicator here.

---

### 5. quadratic-algo ⚠️

**Problem:** O(n²) deduplication using nested loops.

**Baseline:** 137 req/s, 4,686ms latency (924 errors)

**Subagent fix:** Used `Set` for O(1) lookups, achieving O(n) complexity.

**Post-fix:** 269 req/s, 37ms latency (0 errors)

**Improvement:** 1.96x throughput, 127x latency

**Analysis:** Same issue as memory-churn - baseline errors skewed the throughput metric. The fix was demonstrably correct (127x latency improvement, zero errors).

---

## Conclusions

### What Worked

1. **Bottleneck identification:** The LLM correctly identified all 5 performance issues from either pprof profiles or code analysis.

2. **Fix quality:** All 5 fixes were idiomatic, correct, and followed best practices:
   - Caching parsed config
   - Pre-compiling regex
   - Parallelizing async operations
   - Single-pass array processing
   - Using Set for O(1) lookups

3. **pprof-to-llm format:** The adaptive format provided enough context for the LLM to understand call paths and identify hotspots.

### What Needs Improvement

1. **Workload design:** Some bottlenecks (regex-hotpath) were masked by I/O. Larger payloads or isolated benchmarks would better expose CPU-bound issues.

2. **Baseline stability:** Tests with errors/timeouts produce misleading throughput numbers. Need separate handling or pre-validation.

3. **Metrics:** Latency is often a better success indicator than throughput for these fixes. Consider dual targets.

4. **Async bottlenecks:** CPU profiling doesn't capture async wait time. Need wall-clock or async-aware profiling for N+1 patterns.

### Recommendations

1. **Use latency as primary metric** for optimization evals
2. **Increase payload sizes** to isolate CPU-bound bottlenecks
3. **Add warmup phase** to stabilize baseline measurements
4. **Consider async profiling** for I/O-bound workloads

---

## Appendix: Test Apps

All test apps are in `eval/apps/`:

- `json-bottleneck/` - JSON parsing on every request
- `regex-hotpath/` - RegExp creation in loop
- `n-plus-one/` - Sequential async calls
- `memory-churn/` - Intermediate array allocations
- `quadratic-algo/` - O(n²) deduplication
