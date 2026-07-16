# ADR-0007: Middle-end Passes Parallelization

| Status | Date | Author |
|:------:|:----:|:------:|
| Accepted | 2026-07-16 | srs-formalizer |

## Context

Issue #13 (Performance & Scalability) identified that `pipeline.ts` runs all 5 middle-end passes sequentially, adding 1-4 seconds of wall-clock time for large SRS documents. Analysis of the pass I/O patterns revealed that 3 of the 5 passes are read-only on `srs-ir.json` and could safely run in parallel.

The original sequential order was:
```
analyze-structure → analyze-graph → tag-nfr → check-connectivity → score-risk
```

## Decision

Implement a 3-phase parallelization strategy in a new module `lib/pipeline/middle-end-runner.ts`:

- **Phase 1 (parallel)**: `analyze-structure` + `analyze-graph` — both read-only on original IR
- **Phase 2 (sequential)**: `tag-nfr` — mutates IR (adds NFR tags), must run exclusively
- **Phase 3 (parallel)**: `check-connectivity` + `score-risk` — read NFR-tagged IR; `score-risk` mutates IR but only writes `meta.riskScore`/`meta.highRiskShards`, which `check-connectivity` does not read

This preserves the original data-flow semantics (structure/graph analysis sees pre-NFR IR; connectivity/risk sees NFR-tagged IR) while reducing 5 sequential steps to 3 phases.

## Consequences

### Positive
- Wall-clock time reduced from 5 sequential steps to 3 phases (2 of which run 2 passes in parallel)
- Module extraction keeps `pipeline.ts` under the 300-line limit (294 lines)
- Per-pass timing data is now captured in `MiddleEndStepResult.duration_ms` for benchmarking
- New `npm run benchmark` script tracks performance across IR sizes

### Negative
- Progress output interleaves for parallel passes (acceptable, format unchanged per-step)
- Phase 3 has a theoretical race condition between `check-connectivity` (read) and `score-risk` (write), but Node.js single-threaded synchronous I/O prevents actual concurrent access

### Risks/Mitigations
- **Risk**: Behavior change from reordering → **Mitigated**: Phase boundaries preserve original IR data flow
- **Risk**: `check-connectivity` reads stale IR → **Mitigated**: It reads the entire IR into memory via synchronous `readFileSync` before `score-risk` can complete its write

## Alternatives Considered

| Alternative | Pros | Cons | Reason for Rejection |
|------------|------|------|---------------------|
| Full parallel (all 5 passes at once) | Maximum parallelism | `tag-nfr` and `score-risk` both write `srs-ir.json` — race condition would corrupt IR | Unsafe |
| Worker threads | True OS-level parallelism | All passes are CPU-bound synchronous work; worker thread overhead exceeds benefit; violates zero-runtime-deps constraint | Over-engineered |
| Keep sequential | No complexity | No performance improvement | Does not address Issue #13 |

## Related Documents

- [DESIGN.md §6.4](../DESIGN.md#64-pass-依赖与并行化)
- [Phase 3 Design Spec](../superpowers/specs/2026-07-16-middle-end-parallelization-design.md)
- [ADR-0006: File Splitting & Deduplication](0006-file-splitting-and-deduplication.md)
