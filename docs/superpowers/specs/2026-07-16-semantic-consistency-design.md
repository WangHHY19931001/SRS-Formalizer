# Phase 4: Semantic Consistency Checker

**Date:** 2026-07-16
**Status:** Approved (proceeding under broad Phase approval)
**Related Issues:** #12 (Formal Rigor)
**Scope:** Add `validate-semantics` command for IR internal consistency checking

## Problem

The existing validation is fragmented and incomplete:
- `validateIR` (in `lib/frontend/builder.ts`) checks only 2 things (version + dangling edges) and is **never called** by any command
- `verify-gate --stage R3` checks edge integrity on `graph.json`, not on `srs-ir.json`
- `analyze-structure` and `analyze-graph` produce reports, not gates
- No command validates: type enums, reference integrity (crossRefs, nfrProfile), property completeness per node type, or NFR threshold validity

## Design

### New Module: `lib/semantic/consistency-checker.ts`

Pure function `checkSemanticConsistency(ir: SRSIR): SemanticConsistencyReport` that performs 4 categories of checks without duplicating existing tools:

**A. Type Validity** — enum field validation
- `node.type` ∈ IRNodeType union (8 values)
- `edge.type` ∈ IREdgeType union (13 values)
- `node.properties.category`, `confidence`, `nfrCategory`, `archType` ∈ respective enums
- `gap.priority`, `gap.type`, `glossary.category`, `crossRef.refType` ∈ respective enums
- `meta.language` ∈ `{zh, en}`

**B. Reference Integrity** — IR-internal pointer validity
- Edge `source` AND `target` exist in node set (subsumes uncalled `validateIR`)
- `crossRefs[].sourceShard`/`targetShard` reference valid shard IDs
- `nfrProfile.detectedCategories[].nodeIds` reference existing nodes
- Node IDs unique; edge IDs unique
- `meta.totalNodes === nodes.length`; `meta.totalEdges === edges.length`

**C. Property Completeness** — required fields per node type
- `requirement`/`nfr` nodes: `properties.statement` non-empty
- `nfr` nodes: `properties.nfrCategory` present
- `architecture` nodes: `properties.archType` present
- All nodes: `source.filePath` and `source.shardId` non-empty

**D. NFR Threshold Validity**
- `nfrThreshold.value` is finite (not NaN/Infinity)
- `nfrThreshold.operator` ∈ `{<, <=, >, >=, ==}`
- `nfrThreshold.unit` and `nfrThreshold.metric` non-empty
- `nfrThreshold` only on nodes with `nfrCategory`
- `nfrProfile.overallCoverage` ∈ `[0, 1]`

### New Command: `commands/validate-semantics.ts`

CLI: `npx tsx index.ts validate-semantics --workdir .srs_formalizer [--strict]`

- Reads `srs-ir.json`, runs `checkSemanticConsistency`
- Returns `{ status, data: { valid, errors, warnings, summary } }`
- `--strict`: returns `status: 'error'` if any errors found (for pipeline use)
- Without `--strict`: always returns `status: 'ok'` with findings in `data`

### Non-Duplication

- Does NOT re-implement JSONL record checks (`validate-jsonl` handles that)
- Does NOT re-implement duplicate/conflict/aspect analysis (`analyze-graph` handles that)
- Does NOT re-implement orphan/island detection (`analyze-structure` handles that)
- Does NOT check formal artifact verification (`verify-gate --stage FINAL` handles that)

## Testing

Unit tests in `__tests__/semantic-consistency-checker.test.ts`:
1. Valid IR → 0 errors
2. Invalid node.type → error
3. Invalid edge.type → error
4. Dangling edge source → error
5. Dangling edge target → error
6. Duplicate node IDs → error
7. Missing statement on requirement → error
8. Missing nfrCategory on NFR node → error
9. Invalid threshold operator → error
10. NaN threshold value → error
11. Coverage out of range → error
12. meta.totalNodes mismatch → error
