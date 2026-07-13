# End-to-End Walkthrough: Formalizing an SRS with srs-formalizer

This walkthrough uses the compiler pipeline and artifact lifecycle currently implemented by srs-formalizer.

## Prerequisites

- Node.js 20 or later
- Dependencies installed in `.claude/skills/srs-formalizer/scripts/`
- A readable SRS in Markdown or HTML
- Java for TLA+ validation
- Lean 4 / Lake for Lean promotion when security or compliance requirements are present

All commands below run from `.claude/skills/srs-formalizer/scripts/`.

## Pipeline

```text
init → manifest → guided extraction → build-ir → analysis → emit
     → strict validation and promotion → verified-only graph/report generation → FINAL gate
```

The pipeline uses `.srs_formalizer/` as its only output root. `init` takes `--output`; all other commands take `--workdir`.

## 1. Initialize the work directory

```bash
npx tsx index.ts init --output .srs_formalizer
```

The directory includes extraction and graph stages plus the artifact lifecycle:

```text
.srs_formalizer/
├── _ctx/                              # shard index and working context
├── 2_extract/                         # extracted JSONL requirements
├── 3_graph/                           # IR and analysis inputs
├── outputs/
│   ├── bdd/{draft,verified,validation}/
│   ├── tlaplus/{draft,verified,validation}/
│   ├── lean4/{draft,verified,validation}/
│   ├── graphs/                        # deterministic graph exports
│   ├── fixtures/                      # deterministic test fixtures
│   └── reports/                       # deterministic reports
├── STATE.md
└── backups/
```

## 2. Build the source manifest and extract requirements

```bash
npx tsx index.ts manifest \
  --src /absolute/path/to/srs.md \
  --lang zh \
  --workdir .srs_formalizer
```

`manifest` writes `_ctx/shard_index.json`. Use an executor template to retrieve a shard's source content:

```bash
npx tsx index.ts inject-prompt \
  --template ../prompts/executor-R1.md \
  --shard-id S001 \
  --workdir .srs_formalizer \
  --params '{}'
```

Send the returned prompt to the appropriate extraction agent, then validate and append its JSONL records using `guided-extract`. Repeat for R1, R2, R3, and architecture records as required.

## 3. Build and analyze SRS-IR

```bash
npx tsx index.ts build-ir --workdir .srs_formalizer
npx tsx index.ts analyze-structure --workdir .srs_formalizer
npx tsx index.ts analyze-graph --workdir .srs_formalizer
npx tsx index.ts tag-nfr --workdir .srs_formalizer
npx tsx index.ts check-connectivity --workdir .srs_formalizer
npx tsx index.ts score-risk --workdir .srs_formalizer
npx tsx index.ts verify-gate --workdir .srs_formalizer --stage R3
```

The hard gate reports its findings in `data.pass`. Resolve failed checks before generating formal artifacts.

## 4. Emit drafts and deterministic artifacts

```bash
npx tsx index.ts emit --group graphs --workdir .srs_formalizer
npx tsx index.ts emit --group bdd --workdir .srs_formalizer
npx tsx index.ts emit --group formal --workdir .srs_formalizer
```

Use `emit --group all` only when every registered emitter is needed. There is no `emit-all` command.

Emitters write BDD, TLA+, and Lean content to draft directories. A draft is not a delivery artifact and must not be used as FINAL input.

## 5. Complete and promote BDD

Complete each generated `.feature` file in `outputs/bdd/draft/`, ensuring complete Given/When/Then behavior, concrete NFR thresholds, and no placeholder content.

```bash
npx tsx index.ts validate-bdd \
  --strict --promote --workdir .srs_formalizer
```

This runs structural validation, NFR validation, `gherkin-lint`, and Gherklin. A pass atomically promotes files to `outputs/bdd/verified/` and writes a validation report. A failure leaves verified artifacts unchanged.

## 6. Complete and promote TLA+ modules

Complete each generated `.tla` module and its matching `.cfg` in `outputs/tlaplus/draft/`.

```bash
npx tsx index.ts validate-tla \
  --name <module-name> --strict --promote --workdir .srs_formalizer
```

The command validates only the named draft module and matching configuration. On success, it writes a validation report and promotes them to `outputs/tlaplus/verified/`.

## 7. Complete and promote Lean proofs when required

Security or compliance NFRs require Lean proof delivery. Complete a local Lean project in `outputs/lean4/draft/`, use project-local imports, and prove the required theorems.

```bash
npx tsx index.ts validate-lean \
  --strict --promote --workdir .srs_formalizer
```

Strict Lean validation runs source auditing and `lake build`. It rejects `sorry`, `admit`, `axiom`, full `import Mathlib`, semantically weakened `: True` theorems, and compiler warnings. Successful projects are promoted to `outputs/lean4/verified/` with a validation report.

## 8. Generate verified-input downstream outputs

Graph, fixture, traceability, and cross-graph emitters use verified formal artifacts only. Re-run the relevant deterministic groups after successful promotions:

```bash
npx tsx index.ts emit --group graphs --workdir .srs_formalizer
npx tsx index.ts emit --group vmodel --workdir .srs_formalizer
npx tsx index.ts emit --group verify --workdir .srs_formalizer
```

## 9. Run the FINAL hard gate

```bash
npx tsx index.ts verify-gate \
  --workdir .srs_formalizer --stage FINAL
```

FINAL accepts only verified BDD and TLA+ sources with successful validation reports. When the IR detects security or compliance NFRs, verified Lean sources and a successful Lean report are also mandatory. A failed FINAL returns `status: "error"`; do not treat draft content or stale graph exports as a substitute.

## Verification for skill development

Before committing changes to the skill scripts:

```bash
npm run typecheck
npm test
```

The repository requires zero TypeScript diagnostics and zero test failures.
