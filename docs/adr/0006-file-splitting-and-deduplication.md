# ADR-0006: File Splitting and Code Deduplication

| Status | Date | Author |
|:------:|:----:|:------:|
| Accepted | 2026-07-16 | SRS-Formalizer Refactoring |

## Context

AGENTS.md declares "Max 300 lines/file" as a hard constraint, but 5 source files violated it:
- `lib/fixture-gen/nfr.ts` (420 lines)
- `lib/emitters/lean-graph-emitter.ts` (326 lines)
- `commands/health-check.ts` (316 lines)
- `lib/emitters/tla-graph-emitter.ts` (305 lines)
- `lib/emitters/traceability-emitter.ts` (304 lines)

Additionally, `lean-graph-emitter.ts` and `tla-graph-emitter.ts` duplicated types, parsers, and builders that already existed in `lib/lean-graph/` and `lib/tla-graph/` modules.

## Decision

1. **Deduplicate first**: `lean-graph-emitter.ts` and `tla-graph-emitter.ts` were refactored to import from existing `lib/lean-graph/` and `lib/tla-graph/` modules instead of maintaining duplicate code.

2. **Split by category/responsibility**:
   - `nfr.ts` → `nfr/` subdirectory with 8 files (types + 6 category generators + index)
   - `health-check.ts` → `lib/health/` module (types + checks + workdir-check + recommendations) + slim command
   - `traceability-emitter.ts` → `lib/traceability/` module (types + scanners + builder + formatters) + slim emitter

## Consequences

### Positive
- All files now ≤ 300 lines (max: 118 lines)
- Eliminated ~500 lines of duplicated code in lean/tla graph emitters
- Each module has single responsibility, easier to test and maintain
- New category/framework can be added by creating a single file in `nfr/`
- Graph emitter metadata now includes `source_workdir` (from shared builders)

### Negative
- More files to navigate (20 new files replacing 5)
- Import paths slightly longer for consumers of `nfr` module

### Risks/Mitigations
- Import path breakage: Fixed by updating 2 consumer files (`nfr.test.ts`, `fixture-emitter.ts`)
- Metadata addition (source_workdir): Additive, non-breaking; tests verify graph structure, not exact metadata keys

## Alternatives Considered

| Alternative | Pros | Cons | Reason for Rejection |
|------------|------|------|---------------------|
| Split emitters into sub-files (keep duplicate code) | Simpler change | Duplicated code remains | Duplication is a bigger problem than file size |
| Create barrel `nfr.ts` re-exporting from `nfr/index.ts` | No import path changes | Extra indirection layer | Direct imports are clearer; only 2 consumers needed updating |

## Related Documents

- [DESIGN.md](../DESIGN.md)
- [Phase 1 Design Spec](../superpowers/specs/2026-07-16-file-splitting-design.md)
- Issues #11, #12, #13, #14, #15
