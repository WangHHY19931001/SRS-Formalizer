# AGENTS.md

## What this repo is

An AI agent skill that formalizes SRS documents into Cypher graphs, Gherkin BDD, TLA+ specs, and Lean 4 proofs. The actual code lives under `.claude/skills/srs-formalizer/scripts/`. The root is mostly docs and config.

**Architecture**: Agent-driven (Agent 驱动 + 脚本门禁). Scripts only do deterministic gate validation + specialized algorithms; all semantic work (parsing/extraction/analysis/generation) is done by Agent via SKILL.md + prompts + references. 19 commands: 11 Gate Validators + 8 Independent Tools. All artifacts derive from a single SRS-IR (`srs-ir.json`, v2.1.0).

## Build & verify (run from `.claude/skills/srs-formalizer/scripts/`)

```bash
npm install                         # devDeps: typescript, @types/node, gherkin-lint, gherklin
npx tsc --noEmit                    # strict mode, must be 0 errors
npx tsx --test __tests__/*.test.ts  # 325 tests, must be 0 failures
npm run evals                       # deterministic toolchain/lifecycle evaluation
npm run typecheck && npm test       # shortcuts
```

Single test file: `npx tsx --test __tests__/assemble-ir.test.ts`

**Before any commit**: `npm run typecheck`, `npm test`, and `npm run evals` must all pass. Non-negotiable.

## Hard constraints

- **Zero runtime npm deps** — only devDeps allowed. Never add a runtime dependency.
- **Strict TS** — `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.
- **0 `any`** — use `unknown` + `instanceof Error` for error handling.
- **Max 300 lines/file** (current max is 272, `validate-semantics.ts`).
- **`path.join()` only** — never string-concatenate paths. Use `path.dirname`/`path.join`. Manifest/hash keys for relative artifact paths are normalized to forward slashes so behavior is identical on Windows and Linux/WSL2.
- **Poison values rejected** — `undefined/null/NaN/[object Object]` caught at CLI entry by `validateNoPoisonArgs`.
- **All commands routed through `index.ts`** — `refuseDirectInvocation` guard on all registered commands.

## Key conventions

- **Bootstrap (Agent creates workdir structure manually) replaces the archived init command; all remaining commands use --workdir**.
- **Artifact lifecycle**: Agent creates draft artifacts; promotion requires `validate-… --strict --promote`; TLA+ runs bundled SANY and TLC, Lean validates a complete Lake project, and FINAL consumes only verified sources with a report whose `sourceHash` matches current content. Multi-module TLA+ promotes with accumulate semantics (`promoteFilesMerge`, never wipes sibling modules) and FINAL verifies by **module set**, not file count. `hashFiles` is content-addressed (basename + bytes, path-independent), so draft/verified path switches never break report matching.
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
├── index.ts             # CLI entrypoint (registry pattern, 19 commands)
├── commands/            # 19 commands (11 gate validators + 8 tools), all ≤300 lines
├── lib/
│   ├── verify-gate/     # 三级门禁 (S1/R3/FINAL)
│   ├── artifacts/       # 产物路径契约 + hash 绑定 + 提升
│   ├── middle-end/      # connectivity-checker (图连通性), dataflow-analyzer (数据流四类检出)
│   ├── dataflow-extract.ts # 数据流抽取契约 (校验 + canonical 归一转 IR)
│   ├── dataflow-gate.ts # 数据流层次2注入门控 (shadow 模式)
│   ├── bdd-validator.ts # BDD Phase 1+2 validation
│   ├── bdd-tool-runner.ts # Phase 3+4 (gherkin-lint + Gherklin)
│   ├── tla-validator.ts # TLA+ SANY+TLC validation
│   ├── graph*.ts        # 图数据结构与算法
│   ├── cypher.ts, jsonl.ts, cli.ts, fs-utils.ts, id-utils.ts
│   ├── skill-integrity.ts, text-analysis.ts, checklists.ts, security.ts
├── types/
│   ├── srs-ir.ts        # SRS-IR type system (SRSIR, IRNode, IREdge, NFRCategory...)
│   ├── skir.ts          # Skill IR (SkillIR, Constraint, Permission, CapabilityTier...)
│   └── index.ts         # JsonlRecord, CliResult, ShardIndex, GlossaryEntry
└── __tests__/           # 325 tests
```

## Key CLI commands

| Group | Commands |
|------|------|
| Gate Validators | `validate-jsonl`, `validate-semantics`, `validate-architecture`, `validate-cypher`, `validate-bdd --strict --promote`, `validate-tla --strict --promote`, `validate-lean --strict --promote`, `validate-glossary`, `validate-checklist`, `validate-dataflow`, `verify-gate` |
| Independent Tools | `assemble-ir`, `check-connectivity`, `analyze-dataflow`, `query-graph`, `hash-compute`, `tlc-trace-parse`, `verify-skill-integrity`, `pack-skill` |

## Gotchas

- `package-lock.json` is **gitignored** — no lockfile in repo. Run `npm install` to generate one locally.
- TLA+ validation uses only the bundled `tools/tla2tools-1.7.4.jar`; every candidate needs an explicit matching `.cfg`. Strict validation runs SANY then TLC, and does not create cfg, download tools, or promote on failure.
- Lean 4 validation requires a Lake project root (`lakefile.lean` or `lakefile.toml`); its project definition, optional `lean-toolchain`, and `.lean` inputs are hash-bound to its report.
- `verify-gate --stage FINAL` accepts only verified sources with a matching current-content validation report; stale or cross-artifact reports are rejected. For TLA+ it reconstructs the validated **module set** from passing reports and fails if any validated module is missing from `verified/` — a single surviving module can no longer masquerade as full coverage.
- `verify-gate --stage S1` enforces **shard extraction coverage**: every shard in `shard_index.json` must have a non-empty R1 extraction (keyed on the shard segment of each `R1-<shard>-NNNN` id, so interval-named files cannot hide gaps) or be declared in `2_extract/r1-explicit/_empty_shards.json`.
- `validate-architecture` requires a `source_shard` (`SNNN`) field on every arch-1 (`ARCH-*`) record for source traceability, and validates the optional top-level `arch_version` (`1|2|3`, must match the id prefix `ARCH-`/`ARCH2-`/`ARCH3-`).
- Frontend runs a **multi-round refinement loop**: architecture tree versions (v1→v2→v3) alternate with requirement extraction (explicit R1 → implicit R2 → cross-subsystem completion). Each derived/completed requirement carries a tri-state `metadata.provenance`: `explicit-located` (verbatim → IR), `doc-derived` (implicit, medium/low confidence → IR), or `needs-clarification` (**never enters IR**, goes to `GAPS.md` via HITL single-question clarification). `validate-jsonl` hard-fails an unknown provenance or a `needs-clarification` record in r*/architecture JSONL. Source of truth is the design doc only; `frozen/` is not an input.
- `verify-gate --stage R3` adds two convergence gates: a **hierarchy-depth gate** (architecture `contains` chain depth ≥2; ≥3 arch nodes with no hierarchy = `flatTree` fail) and an **orphan-adjudication gate** (each orphan shard must be declared standalone with a reason in `_ctx/orphan_adjudications.json` or have an accepted bridge). `check-connectivity` now reports `hierarchyDepth`/`flatTree`/`architectureNodes`.
- `validate-cypher` accepts Neo4j 4+ batch syntax (`CALL { ... } IN TRANSACTIONS`) — bracket depth is tracked cumulatively across lines, not per-line.
- Cross-platform: verified on both Windows and Linux (WSL2, Node 22, OpenJDK 21). TLA+ tests need the bundled JAR at `<skill>/tools/tla2tools-1.7.4.jar`; copy sibling `tools/` if running from a relocated `scripts/` dir.
- Artifact format contracts (field names, enums, expected gate filenames) are centralized in `references/artifact-contract-cheatsheet.md`.
- **Data-flow review hints** (SRS-IR v2.1.0, spec 2026-07-21 / ADR-0009): a read-only Middle-end bypass. Frontend F4e extracts `2_extract/data-entities/*.jsonl` (`entity`/`flow` records); `assemble-ir` normalizes by `canonical` into `data_entity` nodes + `produces`/`consumes`/`mutates` edges. `analyze-dataflow` (read-only) emits `3_graph/analysis/dataflow.json` with four finding types — dead_data (write-only), gap (use-before-def), boundary (external input/final output), cycle (SCC, often the root of TLA+ deadlock). **Always warning, never fail-closed**; old IR without `data_entity` degrades to empty findings. `validate-dataflow` gates record FORMAT and is wired into `verify-gate --stage S1` (`checkDataFlowFormat` — absent dir = PASS, extraction is optional). IR version check accepts `2.0.0` and `2.1.0`. **Layer-2 injection (BDD/TLA+ executor) is OFF by default (shadow mode)**: enable only after `analyze-dataflow --assess --fp-rate <r> --sample-size <n> --assessed-by <name>` signs off on normalization false-positive rate (writes `_ctx/dataflow_injection_gate.json`).

## Where to find detailed docs

| Topic | Location |
|-------|----------|
| Full design spec | `docs/DESIGN.md` (single source of truth) |
| Compiler refactor design | `docs/superpowers/specs/2026-07-13-compiler-refactor-design.md` |
| Data-flow review hints | `docs/superpowers/specs/2026-07-21-dataflow-review-hints-design.md` + `docs/adr/0009-dataflow-review-hints.md` |
| Sub-project plans | `docs/superpowers/plans/` |
| Coding standards | `rules/project/coding/standards.md` |
| CLAUDE.md | `CLAUDE.md` (overlaps with this file for Claude sessions) |
