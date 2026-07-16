# ADR-0008: Semantic Consistency Checker

| Status | Date | Author |
|:------:|:----:|:------:|
| Accepted | 2026-07-16 | srs-formalizer |

## Context

Issue #12 (Formal Rigor) identified that IR internal consistency validation was fragmented and incomplete:
- `validateIR` in `lib/frontend/builder.ts` checks only 2 things (version + dangling edges) and is **never called** by any command
- `verify-gate --stage R3` checks edge integrity on `graph.json`, not on `srs-ir.json`
- `analyze-structure` and `analyze-graph` produce reports, not gates
- No command validates: type enums, reference integrity (crossRefs, nfrProfile), property completeness per node type, or NFR threshold validity

This left a gap where IRs with invalid enum values, dangling references, or malformed NFR thresholds could pass through the pipeline undetected.

## Decision

Add a new `validate-semantics` command backed by `lib/semantic/consistency-checker.ts` that performs 4 categories of IR-internal validation:

**A. Type Validity** — validates all enum fields against their type unions:
- `node.type` (8 values), `edge.type` (13 values), `nfrCategory` (6 values), `category`/`confidence`/`archType`/`language`

**B. Reference Integrity** — validates IR-internal pointers:
- Edge `source` AND `target` exist in node set (subsumes uncalled `validateIR`)
- Node/edge ID uniqueness
- `meta.totalNodes`/`totalEdges` match actual array lengths
- `nfrProfile.detectedCategories[].nodeIds` reference existing nodes (warning)

**C. Property Completeness** — validates required fields per node type:
- `requirement`/`nfr` nodes must have non-empty `statement`
- `nfr` nodes must have `nfrCategory`
- All nodes must have non-empty `source.filePath` and `source.shardId`

**D. NFR Threshold Validity** — validates threshold well-formedness:
- `value` is a finite number (not NaN/Infinity)
- `operator` ∈ `{<, <=, >, >=, ==}`
- `unit` and `metric` non-empty
- `nfrProfile.overallCoverage` ∈ `[0, 1]`

The command supports `--strict` flag for pipeline gating (returns `status: 'error'` if any errors found).

## Consequences

### Positive
- IR schema violations now detected before downstream emitters process the IR
- Does not duplicate existing checks (analyze-structure, analyze-graph, validate-jsonl, verify-gate)
- Pure function design enables unit testing without filesystem I/O
- `--strict` mode enables use as a pipeline gate after `build-ir`

### Negative
- Adds one new command to the CLI surface area
- Does not yet integrate into the automatic pipeline (could be added as a post-`build-ir` gate in a future change)

### Risks/Mitigations
- **Risk**: False positives on IRs built by older versions → **Mitigated**: All checks use `severity: 'warning'` for advisory findings; only clear schema violations are `'error'`
- **Risk**: Performance on large IRs → **Mitigated**: All checks are O(n) or O(n+m) with hash sets; benchmarked at <5ms for 200 nodes

## Alternatives Considered

| Alternative | Pros | Cons | Reason for Rejection |
|------------|------|------|---------------------|
| Add checks to existing `build-ir` | Single validation point | Couples validation to build step; can't re-validate after manual edits | Separation of concerns |
| Extend `verify-gate --stage R3` | Reuses existing gate framework | R3 checks graph.json, not srs-ir.json; different concern (artifact promotion vs schema validity) | Wrong abstraction level |
| Invoke the uncalled `validateIR` | Minimal code | Only checks 2 things; would need to extend it anyway | Insufficient coverage |

## Related Documents

- [DESIGN.md §8.4](../DESIGN.md#84-验证与维护)
- [Phase 4 Design Spec](../superpowers/specs/2026-07-16-semantic-consistency-design.md)
- [ADR-0007: Middle-end Parallelization](0007-middle-end-parallelization.md)
