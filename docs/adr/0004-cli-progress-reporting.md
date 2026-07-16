# ADR-0004: CLI Progress Reporting & Colored Output

| Status | Date | Author |
|:------:|:----:|:------:|
| Accepted | 2026-07-16 | SRS-Formalizer Team |

## Context

Issues #11 and #14 identified that the CLI user experience could be improved:
- Users and AI agents lacked clear visibility into long-running pipeline operations
- No timing information per step made performance debugging difficult
- Error messages were present but progress indicators were missing
- Agent integration would benefit from consistent, machine-readable yet human-friendly output

The previous CLI only output JSON at the end, with no intermediate progress visible.

## Decision

Implement a `ProgressReporter` utility class in `lib/progress.ts` that provides:

1. **Colored output** using ANSI escape codes with automatic detection:
   - Respects `NO_COLOR` environment variable
   - Disabled when stdout is not a TTY (piped/redirected output)
   - Falls back to ASCII symbols for non-TTY environments

2. **Step tracking** with timing:
   - `startStep(name)` begins timing a step and shows a running indicator
   - `completeStep(step, status, message)` ends timing and shows duration
   - Statuses: ok, warn, error, skipped

3. **Structured messaging**:
   - `info()`, `success()`, `warn()`, `error()` with consistent symbols
   - `header()` for section dividers
   - `summary()` for final statistics

4. **Resource monitoring**:
   - Memory usage (RSS, heap) via `process.memoryUsage()`
   - Displayed in `--verbose` mode or via `VERBOSE=1` env var

5. **Environment variable support**:
   - `NO_COLOR=1` disables colors
   - `VERBOSE=1` enables verbose memory stats

## Consequences

### Positive
- Much better user experience for interactive CLI usage
- AI agents can parse step output while humans get visual feedback
- Performance bottlenecks become immediately visible via step timing
- Memory monitoring helps detect issues with large SRS documents
- Non-TTY/CI environments get clean ASCII output without garbage characters

### Negative
- Small additional code (~170 lines) to maintain
- Colored output may interfere with some JSON parsing pipelines (but JSON output remains separate)

### Risks/Mitigations
- **Risk**: ANSI codes breaking in some terminals → Mitigated by TTY detection + NO_COLOR support
- **Risk**: Progress lines interfering with JSON output → Mitigated by only writing progress to console, JSON still goes through `CliResult`

## Alternatives Considered

| Alternative | Pros | Cons | Reason for Rejection |
|------------|------|------|---------------------|
| No progress (status quo) | Simplest code | Poor UX, hard to debug slowness | Does not address user feedback |
| External library (chalk, ora) | Full-featured | Violates zero-runtime-deps constraint | Security policy forbids runtime deps |
| Simple spinner only | Minimal code | No timing, no structured messages, no resource info | Insufficient for debugging |
| Progress bars | Visual appeal | Complex for variable-length steps (LLM calls, validation) | Timing per step more useful |

## Related Documents

- [DESIGN.md](../DESIGN.md) §4.7 CLI Interface
- [Issue #11](https://github.com/WangHHY19931001/SRS-Formalizer/issues/11) - CLI & UX improvements
- [Issue #14](https://github.com/WangHHY19931001/SRS-Formalizer/issues/14) - Agent experience
- [lib/progress.ts](../../.claude/skills/srs-formalizer/scripts/lib/progress.ts)
