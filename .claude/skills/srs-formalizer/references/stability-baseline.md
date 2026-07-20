# Cross-LLM Stability Baseline（已归档）

> **DEPRECATED (v2.0.0)**：本文档基于已归档的 `capability-probe`/`stability-test` 命令，仅作历史参考。文件保留以维持 MANIFEST.json hash 索引兼容性，**当前流程不再使用**。
>
> **当前能力适配方案**：请参考 [capability-adaptation.md](capability-adaptation.md) 与 `SKILL.md` frontmatter 的 `capability_tiers` 字段。LLM 能力探测与稳定性测试现由 Agent 自主判断能力维度 + 编排者观察完成，无替代命令。
>
> **历史背景**：v1.x 曾用 `capability-probe --mode generate/score` 与 `stability-test --config llm-config.json --passes N` 命令测量 intra-model σ（<1.0 稳定）与 inter-model Δ（<1.5 一致）。v2.0.0 架构反转后这些命令已移除，相关概念由 Agent 自主执行。
