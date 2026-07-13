# AGENTS.md

## What this repo is

An AI agent skill that formalizes SRS documents into Cypher graphs, Gherkin BDD, TLA+ specs, and Lean 4 proofs. The actual code lives under `.claude/skills/srs-formalizer/scripts/`. The root is mostly docs and config.

**Architecture**: Compiler model (Frontend → Middle-end → Backend). All artifacts derive from a single SRS-IR (`srs-ir.json`). 12 Emitters generate outputs (Cypher, Gherkin, TLA+, Lean 4, fixtures, traceability, etc.). TS scripts do deterministic transforms; LLM sub-agents do semantic filling.

## Build & verify (run from `.claude/skills/srs-formalizer/scripts/`)

```bash
npm install                         # devDeps: typescript, @types/node, gherkin-lint, gherklin
npx tsc --noEmit                    # strict mode, must be 0 errors
npx tsx --test __tests__/*.test.ts  # ~477 tests, must be 0 failures
npm run typecheck && npm test       # shortcuts
```

Single test file: `npx tsx --test __tests__/init.test.ts`

**Before any commit**: `npm run typecheck` 0 errors + `npm test` 0 failures. Non-negotiable.

## Hard constraints

- **Zero runtime npm deps** — only devDeps allowed. Never add a runtime dependency.
- **Strict TS** — `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.
- **0 `any`** — use `unknown` + `instanceof Error` for error handling.
- **Max 300 lines/file** (current max is 297).
- **`path.join()` only** — never string-concatenate paths. Use `path.dirname`/`path.join`.
- **Poison values rejected** — `undefined/null/NaN/[object Object]` caught at CLI entry by `validateNoPoisonArgs`.
- **All commands routed through `index.ts`** — `refuseDirectInvocation` guard on all registered commands.

## Key conventions

- **`--output` vs `--workdir`**: `init` uses `--output`, everything else uses `--workdir`. Exception: `validate-lean` finds `lakefile` by walking up from `--file`.
- **`.srs_formalizer` basename enforced** — `validateWorkDir` checks it.
- **All writes scoped to workdir** — `isPathSafe` + `assertSafePath` dual check.
- **New code uses `cli.ts`** for arg parsing and path safety. `security.ts` exists but is legacy.
- **Error pattern**: `try { safeParseArg() } catch { return { status: 'error', message } }` — never throw.
- **CLI output**: JSON to stdout (`{ status, message?, data? }`), exit 0 success / 1 failure.
- **Commit style**: Conventional Commits with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Architecture in 30 seconds

Compiler three-stage: **Frontend** (Parse → Shard → Extract → Build IR) → **Middle-end** (6 analysis passes) → **Backend** (12 Emitters). All outputs from a single `srs-ir.json`.

```
scripts/
├── index.ts             # CLI entrypoint (registry pattern)
├── commands/            # commands, all ≤300 lines
├── lib/
│   ├── frontend/        # Parser, Sharder, NFRScanner, Builder, RoundCalculator
│   ├── middle-end/      # NFRThresholds, NFRTagger, Connectivity, RiskScorer
│   ├── emitters/        # 12 Emitters (Cypher, Gherkin, TLA+, Lean, Fixture...)
│   ├── fixture-gen/     # V-Model test fixture generators
│   ├── bdd-validator.ts # BDD Phase 1+2 validation
│   ├── bdd-tool-runner.ts # Phase 3+4 (gherkin-lint + Gherklin)
│   └── ... (graph, jsonl, cli, etc.)
├── types/
│   ├── srs-ir.ts        # SRS-IR type system (SRSIR, IRNode, IREdge, NFRCategory...)
│   └── index.ts         # JsonlRecord, CliResult
└── __tests__/           # test files
```

## Key CLI commands

| Group | Commands |
|------|------|
| Frontend | `manifest`, `guided-extract`, `inject-prompt`, `build-ir` |
| Middle-end | `analyze-structure`, `analyze-graph`, `tag-nfr`, `check-connectivity`, `merge-analysis`, `score-risk` |
| Backend | `emit --group graphs\|bdd\|formal\|vmodel\|verify`, `emit-all`, `validate-bdd --strict` |
| Validate | `validate-jsonl`, `validate-architecture`, `validate-cypher`, `validate-tla`, `validate-lean`, `validate-glossary`, `verify-gate` |

## Gotchas

- `package-lock.json` is **gitignored** — no lockfile in repo. Run `npm install` to generate one locally.
- **`_ctx/` vs `1_input/` inconsistency**: `manifest.ts` writes shard index to `1_input/` but `inject-prompt.ts` reads from `_ctx/shard_index.json`. End-to-end pipeline may be broken.
- TLA+ validation: delete old trace/state files before debugging.
- Lean 4: follow the 4-step split-proof cycle (skeleton with sorry → one file per sorry → split further if stuck → repeat).
- BDD: must be `.feature` files with complete Given/When/Then — never Markdown descriptions.
- BDD strict mode: 4-level hard-block (TS basic + TS NFR + gherkin-lint + Gherklin). Any failure → kick back to Frontend.
- TLA+ now covers ALL modules (not conditional). 6 NFR invariants generated per module.
- `capability-probe` only generates TLA+/Lean 4 dimensions when toolchains are present.

## Where to find detailed docs

| Topic | Location |
|-------|----------|
| Full design spec | `docs/DESIGN.md` (single source of truth) |
| Compiler refactor design | `docs/superpowers/specs/2026-07-13-compiler-refactor-design.md` |
| Sub-project plans | `docs/superpowers/plans/` |
| Coding standards | `rules/project/coding/standards.md` |
| CLAUDE.md | `CLAUDE.md` (overlaps with this file for Claude sessions) |
