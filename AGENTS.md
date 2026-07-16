# AGENTS.md

## What this repo is

An AI agent skill that formalizes SRS documents into Cypher graphs, Gherkin BDD, TLA+ specs, and Lean 4 proofs. The actual code lives under `.claude/skills/srs-formalizer/scripts/`. The root is mostly docs and config.

**Architecture**: Agent-driven (Agent 驱动 + 脚本门禁). Scripts only do deterministic gate validation + specialized algorithms; all semantic work (parsing/extraction/analysis/generation) is done by Agent via SKILL.md + prompts + references. 17 commands: 10 Gate Validators + 7 Independent Tools. All artifacts derive from a single SRS-IR (`srs-ir.json`).

## Build & verify (run from `.claude/skills/srs-formalizer/scripts/`)

```bash
npm install                         # devDeps: typescript, @types/node, gherkin-lint, gherklin
npx tsc --noEmit                    # strict mode, must be 0 errors
npx tsx --test __tests__/*.test.ts  # 200 tests, must be 0 failures
npm run evals                       # deterministic toolchain/lifecycle evaluation
npm run typecheck && npm test       # shortcuts
```

Single test file: `npx tsx --test __tests__/assemble-ir.test.ts`

**Before any commit**: `npm run typecheck`, `npm test`, and `npm run evals` must all pass. Non-negotiable.

## Hard constraints

- **Zero runtime npm deps** — only devDeps allowed. Never add a runtime dependency.
- **Strict TS** — `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.
- **0 `any`** — use `unknown` + `instanceof Error` for error handling.
- **Max 300 lines/file** (current max is 298).
- **`path.join()` only** — never string-concatenate paths. Use `path.dirname`/`path.join`.
- **Poison values rejected** — `undefined/null/NaN/[object Object]` caught at CLI entry by `validateNoPoisonArgs`.
- **All commands routed through `index.ts`** — `refuseDirectInvocation` guard on all registered commands.

## Key conventions

- **Bootstrap (Agent creates workdir structure manually) replaces the archived init command; all remaining commands use --workdir**.
- **Artifact lifecycle**: Agent creates draft artifacts; promotion requires `validate-… --strict --promote`; TLA+ runs bundled SANY and TLC, Lean validates a complete Lake project, and FINAL consumes only verified sources with a report whose `sourceHash` matches current content.
- **`.srs_formalizer` basename enforced** — `validateWorkDir` checks it.
- **All writes scoped to workdir** — `isPathSafe` + `assertSafePath` dual check.
- **New code uses `cli.ts`** for arg parsing and path safety. `security.ts` exists but is legacy.
- **Error pattern**: `try { safeParseArg() } catch { return { status: 'error', message } }` — never throw.
- **CLI output**: JSON to stdout (`{ status, message?, data? }`), exit 0 success / 1 failure.
- **Commit style**: Conventional Commits with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Architecture in 30 seconds

Agent-driven: **Frontend** (Agent parses SRS → shards → extracts JSONL → assemble-ir) → **Middle-end** (Agent analyzes structure/semantics/NFR/risk + check-connectivity tool) → **Backend** (Agent generates Cypher/BDD/TLA+/Lean/fixtures/traceability → validate-* --strict --promote). All outputs derive from a single `srs-ir.json`.

```
scripts/
├── index.ts             # CLI entrypoint (registry pattern, 17 commands)
├── commands/            # 17 commands (10 gate validators + 7 tools), all ≤300 lines
├── lib/
│   ├── verify-gate/     # 三级门禁 (S1/R3/FINAL)
│   ├── artifacts/       # 产物路径契约 + hash 绑定 + 提升
│   ├── middle-end/      # connectivity-checker (图连通性)
│   ├── bdd-validator.ts # BDD Phase 1+2 validation
│   ├── bdd-tool-runner.ts # Phase 3+4 (gherkin-lint + Gherklin)
│   ├── tla-validator.ts # TLA+ SANY+TLC validation
│   ├── graph*.ts        # 图数据结构与算法
│   ├── cypher.ts, jsonl.ts, cli.ts, fs-utils.ts, id-utils.ts
│   ├── skill-integrity.ts, text-analysis.ts, checklists.ts, security.ts
├── types/
│   ├── srs-ir.ts        # SRS-IR type system (SRSIR, IRNode, IREdge, NFRCategory...)
│   └── index.ts         # JsonlRecord, CliResult
└── __tests__/           # 200 tests
```

## Key CLI commands

| Group | Commands |
|------|------|
| Gate Validators | `validate-jsonl`, `validate-semantics`, `validate-architecture`, `validate-cypher`, `validate-bdd --strict --promote`, `validate-tla --strict --promote`, `validate-lean --strict --promote`, `validate-glossary`, `validate-checklist`, `verify-gate` |
| Independent Tools | `assemble-ir`, `check-connectivity`, `query-graph`, `hash-compute`, `tlc-trace-parse`, `verify-skill-integrity`, `pack-skill` |

## Gotchas

- `package-lock.json` is **gitignored** — no lockfile in repo. Run `npm install` to generate one locally.
- TLA+ validation uses only the bundled `tools/tla2tools-1.7.4.jar`; every candidate needs an explicit matching `.cfg`. Strict validation runs SANY then TLC, and does not create cfg, download tools, or promote on failure.
- Lean 4 validation requires a Lake project root (`lakefile.lean` or `lakefile.toml`); its project definition, optional `lean-toolchain`, and `.lean` inputs are hash-bound to its report.
- `verify-gate --stage FINAL` accepts only verified sources with a matching current-content validation report; stale or cross-artifact reports are rejected.

## Where to find detailed docs

| Topic | Location |
|-------|----------|
| Full design spec | `docs/DESIGN.md` (single source of truth) |
| Compiler refactor design | `docs/superpowers/specs/2026-07-13-compiler-refactor-design.md` |
| Sub-project plans | `docs/superpowers/plans/` |
| Coding standards | `rules/project/coding/standards.md` |
| CLAUDE.md | `CLAUDE.md` (overlaps with this file for Claude sessions) |
