# AGENTS.md

## What this repo is

An AI agent skill that formalizes SRS documents into Cypher graphs, Gherkin BDD, TLA+ specs, and Lean 4 proofs. The actual code lives under `.claude/skills/srs-formalizer/scripts/`. The root is mostly docs and config.

## Build & verify (run from `.claude/skills/srs-formalizer/scripts/`)

```bash
npm install                         # zero runtime deps — only typescript + @types/node
npx tsc --noEmit                    # strict mode, must be 0 errors
npx tsx --test __tests__/*.test.ts  # ~426 tests, must be 0 failures
npm run typecheck && npm test       # shortcuts
```

Single test file: `npx tsx --test __tests__/init.test.ts`

**Before any commit**: `tsc --noEmit` 0 errors + ~426 tests pass. Non-negotiable.

## Hard constraints

- **Zero runtime npm deps** — only devDeps allowed. Never add a runtime dependency.
- **Strict TS** — `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.
- **0 `any`** — use `unknown` + `instanceof Error` for error handling.
- **Max 300 lines/file** (current max is 283).
- **`path.join()` only** — never string-concatenate paths. Use `path.dirname`/`path.join`.
- **Poison values rejected** — `undefined/null/NaN/[object Object]` caught at CLI entry by `validateNoPoisonArgs`.
- **All commands routed through `index.ts`** — `refuseDirectInvocation` guard on all 33 commands.

## Key conventions

- **`--output` vs `--workdir`**: `init` uses `--output`, everything else uses `--workdir`. Exception: `validate-lean` finds `lakefile` by walking up from `--file`.
- **`.srs_formalizer` basename enforced** — `validateWorkDir` checks it.
- **All writes scoped to workdir** — `isPathSafe` + `assertSafePath` dual check.
- **New code uses `cli.ts`** for arg parsing and path safety. `security.ts` exists but is legacy (only `validate-jsonl` and `validate-architecture` import it).
- **Error pattern**: `try { safeParseArg() } catch { return { status: 'error', message } }` — never throw.
- **CLI output**: JSON to stdout (`{ status, message?, data? }`), exit 0 success / 1 failure.
- **Commit style**: Conventional Commits with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Architecture in 30 seconds

Seven-stage pipeline `S0→S1→S2→S3→S4→S5→S6`, each with gate conditions. TS scripts do deterministic transforms; LLM sub-agents do semantic judgment; orchestrator makes flow decisions.

- `scripts/index.ts` — CLI entrypoint (registry pattern, 33 commands)
- `scripts/commands/` — one file per command, all ≤300 lines
- `scripts/lib/` — 27 core modules + 10 subdirectories (includes `fixture-gen/` for V-Model test generation: template-engine, tla-counterexample, playwright-page, nfr, traceability, helpers)
- `scripts/types/` — shared types (JsonlRecord, CliResult, etc.)
- `scripts/__tests__/` — 50 test files, ~426 tests (47 base + 10 fixture-gen)

## Where to find detailed docs

| Topic | Location |
|-------|----------|
| Full design spec | `docs/DESIGN.md` (single source of truth) |
| CLI parameter reference | `.claude/skills/srs-formalizer/references/quick-reference.md` |
| Skill instructions (L1+L2) | `.claude/skills/srs-formalizer/SKILL.md` |
| Rules & conventions | `rules/index.md` (entry point) |
| Skill-specific rules | `rules/skill/` (structure, security, cross-platform, verification) |
| Coding standards | `rules/project/coding/standards.md` |
| CLAUDE.md (Claude-specific) | `CLAUDE.md` (overlaps with this file for Claude sessions) |

## Gotchas

- `scripts/templates/check.sh.template` is NOT in the main `templates/` dir — it's a separate path.
- **`_ctx/` vs `1_input/` inconsistency**: `manifest.ts` writes shard index to `1_input/` but `inject-prompt.ts:60` reads from `_ctx/shard_index.json`. End-to-end pipeline may be broken.
- TLA+ validation: delete old trace/state files before debugging.
- Lean 4: follow the 4-step split-proof cycle (skeleton with sorry → one file per sorry → split further if stuck → repeat).
- BDD: must be `.feature` files with complete Given/When/Then — never Markdown descriptions.
- `capability-probe` only generates TLA+/Lean 4 dimensions when toolchains are present.
