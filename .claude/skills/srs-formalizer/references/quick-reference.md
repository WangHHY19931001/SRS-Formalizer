# CLI 快速参考

SRS-Formalizer v2.0.0 的 17 个命令（10 门禁 + 7 工具）。所有命令经 `npx tsx index.ts <command>` 调用，输出 JSON `{ status, message?, data? }`。

## Gate Validators（门禁校验器，只做确定性校验）

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `npx tsx index.ts validate-jsonl --file <path> --workdir .srs_formalizer` | 校验 JSONL 记录格式（6 项） | `--file` 必需 |
| `npx tsx index.ts validate-semantics --workdir .srs_formalizer [--strict]` | 校验 srs-ir.json 语义一致性 | `--strict` 加严 |
| `npx tsx index.ts validate-architecture --workdir .srs_formalizer` | 校验架构 JSONL（6 项） | — |
| `npx tsx index.ts validate-cypher --file <path> --workdir .srs_formalizer` | 校验 .cypher 语法（4 项） | `--file` 必需 |
| `npx tsx index.ts validate-bdd [--strict --promote] --workdir .srs_formalizer` | 校验 .feature（Phase1-4） | `--promote` 提升到 verified |
| `npx tsx index.ts validate-tla --name <module> [--strict --promote] --workdir .srs_formalizer` | 校验 .tla + .cfg（SANY+TLC） | `--name` 必需 |
| `npx tsx index.ts validate-lean [--strict --promote] --workdir .srs_formalizer` | 校验 Lake 项目（lake build） | — |
| `npx tsx index.ts validate-glossary --file <path> --workdir .srs_formalizer` | 校验术语 JSON（8 项） | `--file` 必需 |
| `npx tsx index.ts validate-checklist --workdir .srs_formalizer` | 校验 CHECKLIST.md 完整性 | — |
| `npx tsx index.ts verify-gate --stage <S1\|R3\|FINAL> --workdir .srs_formalizer` | 三级门禁 | `--stage` 必需 |

## Independent Tools（独立工具，处理 LLM 不便操作的数据结构/算法）

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `npx tsx index.ts assemble-ir --workdir .srs_formalizer` | JSONL → srs-ir.json 装配 + 完整性校验 | — |
| `npx tsx index.ts check-connectivity --workdir .srs_formalizer` | 图连通性/SCC/孤岛检测 | — |
| `npx tsx index.ts query-graph --query <type> --params '<json>' --workdir .srs_formalizer` | IR 查询接口（node/neighbors/module/path） | `--query` `--params` 必需 |
| `npx tsx index.ts hash-compute --file <path> [--compare <hash>] --workdir .srs_formalizer` | 计算/比对 SHA-256 sourceHash | `--file` 必需 |
| `npx tsx index.ts tlc-trace-parse --trace <path> --workdir .srs_formalizer` | 解析 TLC 反例 trace 为状态序列 | `--trace` 必需 |
| `npx tsx index.ts verify-skill-integrity --skill-dir <path> [--repair]` | 技能完整性校验 | `--skill-dir` 必需 |
| `npx tsx index.ts pack-skill --skill-dir <path> --output <backup.tar.gz> --force` | 加密备份（仅人类 --force） | 全部必需 |

## 调用时机

| 阶段 | 调用的门禁/工具 |
|------|----------------|
| F1 分片后 | `validate-checklist` |
| F2/F4 JSONL 提取后 | `validate-jsonl --file <each>` |
| F3 架构分解后 | `validate-architecture` |
| F4 术语提取后 | `validate-glossary` |
| F5 装配 IR | `assemble-ir` + `verify-gate --stage S1` |
| M1-M6 各步后 | `validate-semantics --strict` |
| M4 连通性 | `check-connectivity` |
| M6 风险评分后 | `verify-gate --stage R3` |
| B1 Cypher 后 | `validate-cypher` |
| B2 BDD 后 | `validate-bdd --strict --promote` |
| B3 TLA+ 后 | `validate-tla --name <module> --strict --promote` |
| B4 Lean 后 | `validate-lean --strict --promote` |
| B5 TLC 反例 | `tlc-trace-parse` |
| B7 最终 | `hash-compute` + `verify-gate --stage FINAL` |
| 阶段转换 | `verify-skill-integrity` |
| 备份（仅人类） | `pack-skill --force` |

完整规范见 `docs/DESIGN.md`。
