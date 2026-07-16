# Phase 1: File Splitting & Code Deduplication

**Date:** 2026-07-16
**Status:** Approved
**Related Issues:** #11, #12, #13, #14, #15 (foundation for all subsequent work)
**Scope:** Split 5 source files exceeding the 300-line hard constraint, eliminate code duplication

## Problem

AGENTS.md declares "Max 300 lines/file" as a hard constraint, but 5 source files violate it:

| File | Lines | Root Cause |
|------|-------|------------|
| `lib/fixture-gen/nfr.ts` | 420 | All 6 NFR category generators in one file |
| `lib/emitters/lean-graph-emitter.ts` | 326 | Duplicates types/parser/builder from `lib/lean-graph/` |
| `commands/health-check.ts` | 316 | Types + checks + workdir + recommendations + main in one file |
| `lib/emitters/tla-graph-emitter.ts` | 305 | Duplicates types/parser/builder from `lib/tla-graph/` |
| `lib/emitters/traceability-emitter.ts` | 304 | Types + scanners + builder + formatters + emitter in one file |

## Design

### Principle: Deduplicate First, Then Split

Two emitters (`lean-graph-emitter.ts`, `tla-graph-emitter.ts`) duplicate code that already exists in dedicated `lib/lean-graph/` and `lib/tla-graph/` modules. The correct fix is to **import from existing modules** rather than creating new splits.

### File-by-File Plan

#### 1. nfr.ts (420 → ~40 lines as index.ts)

Split the NFR_GENERATORS registry by category into a `nfr/` subdirectory:

```
lib/fixture-gen/nfr/
├── types.ts           — Framework, GeneratorFn types + classify() helper
├── performance.ts     — performance generators (pytest/junit/fast-check)
├── security.ts        — security generators (pytest/junit/fast-check)
├── availability.ts    — availability generators (pytest/junit/fast-check)
├── compatibility.ts   — compatibility generators (cucumber/playwright)
├── maintainability.ts — maintainability generators (pytest/junit)
├── compliance.ts      — compliance generators (pytest/junit)
└── index.ts           — registry + generateNfrFixtures/supportsFramework/supportedFrameworks
```

The original `nfr.ts` is replaced by `nfr/index.ts`. Existing imports (`from './nfr.js'`) resolve to `nfr/index.js` automatically.

#### 2. lean-graph-emitter.ts (326 → ~55 lines)

**Deduplicate**: Delete inline types/parser/builder. Import from existing `lib/lean-graph/` module:

```typescript
import { buildLeanGraphFromDir } from '../lean-graph/builder.js';
import type { LeanGraph } from '../lean-graph/types.js';
```

The emitter class calls `buildLeanGraphFromDir(proofsDir, workdir)` instead of its own `buildLeanGraph`. Metadata now includes `source_workdir` (from the existing builder).

#### 3. tla-graph-emitter.ts (305 → ~50 lines)

**Deduplicate**: Same pattern as lean-graph. Import from existing `lib/tla-graph/` module:

```typescript
import { buildTlaGraphFromDir } from '../tla-graph/builder.js';
import type { TlaGraph } from '../tla-graph/types.js';
```

#### 4. health-check.ts (316 → ~95 lines)

Extract types and logic into `lib/health/` module:

```
lib/health/
├── types.ts           — HealthCheck, WorkDirStatus, HealthReport, PackageJson
├── checks.ts          — checkNodeVersion, checkCommand, checkJava, checkLean, checkProjectFiles
├── workdir-check.ts   — checkWorkDir
└── recommendations.ts — generateRecommendations
```

`commands/health-check.ts` retains only `main()` — arg parsing, check orchestration, report assembly.

#### 5. traceability-emitter.ts (304 → ~30 lines)

Extract into `lib/traceability/` module:

```
lib/traceability/
├── types.ts       — MatrixRow, CoverageCounts
├── scanners.ts    — scanBddScenarios, scanTlaInvariants, scanLeanTheorems, scanFixtureFiles + resolve helpers
├── builder.ts     — buildAdjacency, buildNodeMap, collectReachableEdges, buildMatrix, buildCounts
└── formatters.ts  — formatMarkdownTable, formatCypherMatrix
```

The emitter class becomes a thin wrapper calling `buildMatrix` → `formatMarkdownTable` / `formatCypherMatrix`.

## Constraints

- All new files ≤ 300 lines (target: ≤ 120 lines each)
- `path.join()` only — no string concatenation for paths
- Strict TypeScript: no `any`, use `unknown` + `instanceof Error`
- Zero runtime dependencies
- `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` enforced
- Existing public API preserved (all exports unchanged)
- All existing test files must pass without modification

## Verification

```bash
cd .claude/skills/srs-formalizer/scripts
npx tsc --noEmit                    # 0 errors
npx tsx --test __tests__/*.test.ts  # 0 failures
npm run evals                       # pass
```

## Risk

- **Low risk**: All changes are pure refactoring (extract module, no logic change)
- **Import path changes**: Existing consumers import from same paths; new modules use `.js` extensions per ESM convention
- **Metadata addition**: lean/tla graph emitters gain `source_workdir` in metadata — this is additive, not breaking
