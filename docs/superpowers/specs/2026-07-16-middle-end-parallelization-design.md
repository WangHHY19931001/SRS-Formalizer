# Phase 3: Middle-end Passes Parallelization

**Date:** 2026-07-16
**Status:** Approved (proceeding under broad Phase approval)
**Related Issues:** #13 (Performance & Scalability)
**Scope:** Parallelize the 5 middle-end passes in `pipeline.ts` to reduce wall-clock time

## Problem

`commands/pipeline.ts` (lines 214-225) runs all 5 middle-end passes sequentially:

```
analyze-structure → analyze-graph → tag-nfr → check-connectivity → score-risk
```

For large SRS documents (≥100 shards), each pass takes 200-800ms, totaling 1-4 seconds of wall-clock time that could be reduced through safe parallelization.

## Dependency & I/O Analysis

### Pass Classification

| Pass | Reads `srs-ir.json` | Writes `srs-ir.json` | Writes analysis files | Depends on |
|------|:---:|:---:|:---:|------|
| `analyze-structure` (M1) | yes | **no** | yes (`orphan_nodes.jsonl`, etc.) | — |
| `analyze-graph` (M2) | yes | **no** | yes (`suspected_duplicates.jsonl`, etc.) | — |
| `tag-nfr` (M3) | yes | **yes** (mutates) | no | — |
| `check-connectivity` (M4) | yes | **no** | no (returns report only) | — |
| `score-risk` (M6) | yes | **yes** (mutates) | no | **tag-nfr** (uses `nfrProfile.overallCoverage`) |

### Key Findings

1. **3 passes are read-only on `srs-ir.json`**: `analyze-structure`, `analyze-graph`, `check-connectivity`
2. **2 passes mutate `srs-ir.json`**: `tag-nfr`, `score-risk`
3. **`score-risk` depends on `tag-nfr`**: it uses `ir.nfrProfile.overallCoverage` which `tagNFR()` populates
4. **`score-risk` internally calls `checkConnectivity()`** (see `lib/middle-end/risk-scorer.ts:23`), but `check-connectivity` command is still useful as a standalone diagnostic
5. **No pass reads another pass's output files**: each operates only on `srs-ir.json`

### Original Semantics

The original sequential order encodes a specific data flow:
- `analyze-structure` and `analyze-graph` see the **original IR** (before NFR tagging)
- `check-connectivity` sees the **NFR-tagged IR** (after `tag-nfr`)
- `score-risk` sees the **NFR-tagged IR** and adds risk scores

## Design

### Parallelization Strategy

Preserve original semantics by grouping passes into 3 phases:

```
Phase 1 (parallel)      Phase 2 (sequential)   Phase 3 (parallel)
┌─────────────────────┐ ┌──────────────────┐  ┌─────────────────────────┐
│ analyze-structure  │ │ tag-nfr          │  │ check-connectivity       │
│ analyze-graph       │ │ (mutates IR)     │  │ score-risk (mutates IR)  │
└─────────────────────┘ └──────────────────┘  └─────────────────────────┘
   see original IR         adds NFR tags         see NFR-tagged IR
```

**Wall-clock time:** 5 sequential steps → 3 phases (2 of which run 2 passes in parallel).

### Safety Analysis for Phase 3

Phase 3 runs `check-connectivity` (read-only) and `score-risk` (mutating) in parallel. This is safe because:

1. **`check-connectivity` uses synchronous `readFileSync`**: reads the entire IR into memory atomically, then operates on its in-memory copy
2. **`score-risk` does `readFileSync` → mutate → `writeFileSync`**: the write only affects future reads, not `check-connectivity`'s in-memory copy
3. **Output is deterministic**: `check-connectivity` only inspects `nodes[]` and `edges[]`, which `score-risk` does not modify. `score-risk` only writes `meta.riskScore` and `meta.highRiskShards`, which `check-connectivity` does not read.
4. **Node.js single-threaded execution**: synchronous operations do not actually run simultaneously; `Promise.all` only overlaps the `await import()` phase and any future async I/O.

### Module Extraction

`pipeline.ts` is currently 294 lines (near the 300-line limit). Inline parallelization would push it over the limit. Extract the middle-end execution logic into a new module:

**New file:** `lib/pipeline/middle-end-runner.ts` (~120 lines)

```typescript
export interface MiddleEndStepResult {
  id: string;
  name: string;
  status: 'ok' | 'warn' | 'error';
  message?: string;
  data?: unknown;
  duration_ms: number;
}

export interface MiddleEndRunnerOptions {
  workDir: string;
  progress?: ProgressReporter;
}

/**
 * Executes the 5 middle-end passes with safe parallelization.
 *
 * Phase 1 (parallel): analyze-structure + analyze-graph (read-only on original IR)
 * Phase 2 (sequential): tag-nfr (mutates IR, adds NFR tags)
 * Phase 3 (parallel): check-connectivity + score-risk (see NFR-tagged IR)
 *
 * Returns results in execution order. Caller handles failure semantics
 * (analyze-structure/analyze-graph failures are non-fatal, same as original).
 */
export async function runMiddleEndPasses(
  options: MiddleEndRunnerOptions
): Promise<MiddleEndStepResult[]>
```

### Pipeline Integration

`pipeline.ts` replaces the sequential `for` loop (lines 214-225) with:

```typescript
const middleEndResults = await runMiddleEndPasses({ workDir, progress });
for (const r of middleEndResults) {
  steps.push({
    id: r.id, name: r.name, status: r.status,
    message: r.message, duration_ms: r.duration_ms, data: r.data,
  });
  // Preserve original failure semantics:
  // analyze-structure and analyze-graph failures are non-fatal
  if (r.status === 'error' && r.id !== 'analyze-structure' && r.id !== 'analyze-graph') {
    return failStep(steps[steps.length - 1]!);
  }
}
```

### Progress Reporting

Parallel steps will interleave their output:

```
~ analyze-structure...
~ analyze-graph...
✓ analyze-structure (0.45s) — Completed
✓ analyze-graph (0.52s) — Completed
~ tag-nfr...
✓ tag-nfr (0.18s) — Completed
~ check-connectivity...
~ score-risk...
✓ check-connectivity (0.31s) — Completed
✓ score-risk (0.33s) — Completed
```

This is acceptable and matches the existing `ProgressReporter` semantics (each step has its own `StepTimer`).

## Testing

### Unit Tests: `__tests__/pipeline-middle-end-runner.test.ts`

1. **All passes succeed**: verify 5 results returned with `ok` status
2. **`tag-nfr` failure**: verify Phase 3 does not run (early exit)
3. **`analyze-structure` failure**: verify non-fatal, other passes still run
4. **`analyze-graph` failure**: verify non-fatal, other passes still run
5. **`score-risk` failure**: verify fatal, but `check-connectivity` result is still captured (since they ran in parallel)
6. **Phase ordering**: verify `analyze-graph` sees original IR (no NFR tags), `check-connectivity` sees NFR-tagged IR
7. **Duration tracking**: verify each result has `duration_ms > 0`

### Regression Tests

Existing `analyze-structure.test.ts`, `analyze-graph.test.ts`, `middle-end-nfr-tagger.test.ts`, `middle-end-risk-scorer.test.ts` continue to pass unchanged (they test the library functions directly, not the pipeline).

## Non-Goals

- **Incremental processing** (only re-run affected passes on IR changes): tracked as a separate Issue #13 sub-task
- **Worker threads**: not beneficial since all passes are CPU-bound synchronous work; `Promise.all` is sufficient
- **Configurable parallelism**: YAGNI; the 3-phase strategy is optimal for the current pass set

## Risks

| Risk | Likelihood | Mitigation |
|------|:---:|------|
| Phase 3 race condition corrupts IR | Low | Analyzed: `check-connectivity` is read-only and uses sync I/O; see Safety Analysis |
| Progress output interleaving confuses users | Low | Output format is unchanged per-step; phases are visually separable |
| Behavior change from reordering | None | Phase boundaries preserve original data flow (original IR → NFR-tagged IR → risk-scored IR) |
| `pipeline.ts` exceeds 300 lines | Mitigated | Extraction to `lib/pipeline/middle-end-runner.ts` keeps `pipeline.ts` under limit |
