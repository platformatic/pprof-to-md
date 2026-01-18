# Testing Results: pprof-to-md

## Test Profiles

| Profile | Description | Generated |
|---------|-------------|-----------|
| `cpu-test.pb.gz` | Mixed CPU workload (JSON, regex, compute) | Yes |
| `heap-test.pb.gz` | Memory allocation patterns | Yes |

## Format Comparison

### CPU Profile Analysis

#### Summary Format
- **Token count:** ~300 tokens
- **Correctly identified:** `jsonHeavyWorkload` as primary hotspot (95.3%)
- **Critical path:** Correctly shows call chain
- **Observations:** Correctly notes 97.4% in application code

**Strengths:**
- Compact, scannable
- Clear table format
- Good for quick triage

**Weaknesses:**
- Limited context for root cause analysis
- No source code references

#### Detailed Format
- **Token count:** ~600 tokens
- **Call tree:** Full annotated tree with percentages
- **Function details:** Callers/callees for each hotspot
- **Hotspot analysis:** Investigation hints provided

**Strengths:**
- Complete call tree visualization
- Full caller/callee context
- Good for deep analysis

**Weaknesses:**
- More verbose
- May be overwhelming for simple profiles

#### Adaptive Format
- **Token count:** ~500 tokens
- **Executive summary:** Clear bottleneck identification
- **Drill-down:** Anchor links to detailed sections
- **Insights:** Auto-generated optimization hints

**Strengths:**
- Best balance of summary + detail
- Structured for follow-up questions
- Includes actionable insights

**Weaknesses:**
- Slightly more complex structure

### Heap Profile Analysis

#### Summary Format
- Correctly identified `Buffer.from` as primary allocator (96.2%)
- Shows allocation patterns clearly

#### Detailed Format
- Full allocation tree
- Object count tracking

#### Adaptive Format
- Good balance for memory analysis
- Identifies GC pressure points

## Evaluation Scores

| Criterion | Summary | Detailed | Adaptive |
|-----------|---------|----------|----------|
| Hotspot Identification | 5/5 | 5/5 | 5/5 |
| Root Cause Understanding | 3/5 | 5/5 | 4/5 |
| Actionability | 3/5 | 4/5 | 5/5 |
| Context Utilization | 2/5 | 5/5 | 4/5 |
| Token Efficiency | 5/5 | 3/5 | 4/5 |
| **Total (weighted)** | **3.4/5** | **4.3/5** | **4.4/5** |

## Recommendations

### Default Format: Adaptive
The **adaptive** format provides the best balance for LLM analysis:
1. Executive summary enables quick triage
2. Drill-down sections allow follow-up questions
3. Auto-generated insights improve actionability
4. Token-efficient while maintaining context

### Use Cases by Format

| Format | Best For |
|--------|----------|
| Summary | Quick triage, CI/CD reports, known issues |
| Detailed | Deep investigation, unfamiliar codebases |
| Adaptive | General LLM analysis, interactive sessions |

## Test Protocol Execution

### Standard Prompt Used
```
Analyze this profile and identify the main performance bottlenecks.
Explain what's causing them and suggest investigation priorities.
```

### Results

All formats successfully enabled LLM to:
1. Identify the primary hotspot (`jsonHeavyWorkload` at 95.3%)
2. Understand it's application code (optimizable)
3. Recognize the call chain leading to the bottleneck

The **adaptive** format additionally enabled:
- More specific optimization suggestions
- Better understanding of the workload type (JSON parsing)
- Clear next steps for investigation

## Conclusion

Phase 5 testing confirms the format design achieves its goals:
- All three formats successfully communicate profiling data to LLMs
- Markdown output renders correctly and is easy to parse
- Hotspot identification is accurate across profile types
- The adaptive format is recommended as the default for LLM analysis
