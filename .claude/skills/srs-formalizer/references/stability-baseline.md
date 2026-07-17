# Cross-LLM Stability Baseline

> **已归档**：`capability-probe` 与 `stability-test` 命令已在 v2.0.0 架构重构中归档。LLM 能力探测与稳定性测试现由 Agent 自主判断能力维度 + 编排者观察完成，无替代命令。本文档保留为历史参考，下方命令调用不再有效。

## What Is Stability Testing?

Stability testing measures how consistently an LLM performs across repeated
evaluations of the same capability dimensions. In the srs-formalizer pipeline,
this addresses **SKILL-RUBRIC D3.1**: *"The system must produce deterministic
outputs for identical inputs across LLM provider boundaries."*

There are two axes of stability:

- **Intra-model stability (σ)**: The same provider/model yields consistent
  capability scores across N independent passes. Low σ (< 1.0) means the model
  is self-consistent.
- **Inter-model consistency (Δ)**: Different providers/models yield similar
  capability profiles. Low Δ (< 1.5 per dimension average) means results are
  provider-agnostic.

Note that this infrastructure measures the **PROBE system's stability** — how
consistently an LLM handles the 50 structured-requirement-engineering probes.
This is a proxy for end-to-end pipeline stability, which would require running
actual SRS documents through the full S0-S6 pipeline. If probe-level stability
is high, pipeline stability is likely (but not guaranteed) to be high as well.

---

## How to Run

### Prerequisites

1. Create a JSON config file listing the providers to test:

```json
{
  "providers": [
    {
      "id": "claude-opus-4",
      "name": "Claude Opus 4",
      "provider": "anthropic",
      "model": "claude-opus-4-20250514",
      "temperature": 0.0,
      "maxTokens": 4096
    },
    {
      "id": "claude-sonnet-4",
      "name": "Claude Sonnet 4",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "temperature": 0.0,
      "maxTokens": 4096
    }
  ],
  "passes": 3,
  "outputDir": ".srs_formalizer/stability/"
}
```

2. Run from the scripts directory:

```bash
cd .claude/skills/srs-formalizer/scripts
```

### Phase 1: Generate Prompt Manifests

```bash
# 已归档：stability-test 命令已移除，新架构中由 Agent 自主判断能力维度
# npx tsx index.ts stability-test --config llm-config.json --passes 3 --output .srs_formalizer/stability/
```

This generates N provider × passes manifest files in `.srs_formalizer/stability/manifests/`.
Each manifest contains the probe prompts to send to a specific LLM.

### Phase 2: Collect Answers (Orchestrator)

For each manifest file:

1. Read the manifest JSON — it specifies the provider, model, and probe prompts.
2. Send each probe prompt to the specified LLM.
3. Collect answers in the format:
   ```json
   { "answers": { "<probe_id>": "<llm_output>" } }
   ```
4. Save as `.srs_formalizer/stability/answers/{providerId}-pass-{N}.json`

### Phase 3: Score and Report

```bash
# 已归档：stability-test 命令已移除，新架构中由 Agent 自主判断能力维度
# npx tsx index.ts stability-test --config llm-config.json --score .srs_formalizer/stability/answers/ --output .srs_formalizer/stability/
```

This writes:
- `.srs_formalizer/stability/stability-report.md` — Human-readable report
- `.srs_formalizer/stability/stability-results.json` — Machine-readable data

---

## Interpreting Results

### Intra-model σ (Per Dimension)

| σ Range | Meaning |
|---------|---------|
| < 1.0   | **Stable**: Model produces nearly identical scores across passes |
| 1.0–2.5 | **Moderate**: Some variability, investigate high-σ dimensions |
| > 2.5   | **Unstable**: Significant variability — may indicate nondeterminism or prompt sensitivity |

### Inter-model Δ (Per Dimension Average)

| Δ Range  | Meaning |
|----------|---------|
| < 1.5    | **Consistent**: Providers agree on capability assessment |
| 1.5–3.0  | **Divergent**: Material difference — note in pipeline design |
| > 3.0    | **Incompatible**: Providers give very different capability profiles |

### Overall Stability Score (0–10)

| Score | Meaning |
|-------|---------|
| > 7.0 | **Good**: System is provider-agnostic |
| 4–7   | **Fair**: Some dimensions need attention |
| < 4.0 | **Poor**: Consider standardizing on a single provider |

---

## Baseline Templates

### Per-Model Baseline

| Field | Value |
|-------|-------|
| **Model** | Anthropic Claude Opus 4 |
| **Version** | claude-opus-4-20250514 |
| **Test date** | YYYY-MM-DD |
| **Passes** | 3 |
| **Intra-model avg σ** | _to fill_ |
| **Overall score** | _to fill_ |

| Dimension | Avg Score | σ |
|-----------|-----------|---|
| instruction_following | _to fill_ | _to fill_ |
| structured_output | _to fill_ | _to fill_ |
| precision | _to fill_ | _to fill_ |
| hierarchical_reasoning | _to fill_ | _to fill_ |
| logical_reasoning | _to fill_ | _to fill_ |
| creative_reasoning | _to fill_ | _to fill_ |
| formal_tlaplus | _to fill_ | _to fill_ |
| formal_lean4 | _to fill_ | _to fill_ |

### Cross-Model Comparison

| Model Pair | Avg Δ | Worst Dimension | Notes |
|------------|-------|-----------------|-------|
| _Model A vs B_ | _to fill_ | _to fill_ | _to fill_ |
| _Model A vs C_ | _to fill_ | _to fill_ | _to fill_ |

---

## Known Baselines

_No baselines recorded yet. `stability-test` 命令已归档（新架构中由 Agent 自主判断能力维度），历史基线仅作参考。_

---

## Notes

- Set `temperature: 0.0` in all provider configs for maximum determinism.
- The 50 probes cover 8 dimensions (6–8 probes each).
- Some variance is expected for creative reasoning (the least constrained
  dimension) and formal dimensions (TLA+/Lean4) which are highly domain-specific.
- Always test with the same probes (`generateProbes()` is deterministic).
- Use `--output` to keep historical baselines in separate directories:
  `stability/2026-07-01/`, `stability/2026-07-15/`, etc.
