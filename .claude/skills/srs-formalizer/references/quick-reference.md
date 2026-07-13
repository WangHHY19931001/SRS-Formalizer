# SRS-Formalizer 命令快速参考

> **Agent 注意**: 所有命令必须通过 `npx tsx index.ts <command>` 调用。参数值禁止使用 `undefined`、`null`、`NaN` 等占位符——CLI 将直接拒绝这些值并报错。`init` 命令使用 `--output`（不是 `--workdir`）。

## Frontend

| 命令 | 功能 |
|------|------|
| `npx tsx index.ts init --output .srs_formalizer` | 初始化工作目录（注意：用 `--output` 不是 `--workdir`） |
| `npx tsx index.ts manifest --src <path> --lang zh\|en --workdir .srs_formalizer` | 索引化分片 + 章节识别 (不创建物理文件) |
| `npx tsx index.ts guided-extract --template <path> --shard-id <id> --type r1\|r2\|r3\|arch --workdir .srs_formalizer` | 生成 guided prompt（发给 LLM 逐行提取） |
| `npx tsx index.ts guided-extract --line '<json>' --shard-id <id> --type r1\|r2\|r3\|arch --workdir .srs_formalizer` | 处理单行 JSON（校验+追加到输出文件），返回 OK/ERR/DONE |
| `npx tsx index.ts inject-prompt --template <path> --shard-id <id> --workdir .srs_formalizer` | 填充子代理提示词模板（按分片ID查找） |
| `npx tsx index.ts build-ir --workdir .srs_formalizer` | JSONL → srs-ir.json (v2.0.0) |

## Middle-end

| 命令 | 功能 |
|------|------|
| `npx tsx index.ts analyze-structure --workdir .srs_formalizer` | 孤立/悬挂/孤岛检测 |
| `npx tsx index.ts analyze-graph --workdir .srs_formalizer` | Jaccard 去重 + 反义检测 |
| `npx tsx index.ts tag-nfr --workdir .srs_formalizer` | NFR 自动标签 + 阈值分类 |
| `npx tsx index.ts check-connectivity --workdir .srs_formalizer` | 节点连通性验证 |
| `npx tsx index.ts merge-analysis --workdir .srs_formalizer` | 语义判定合并 |
| `npx tsx index.ts score-risk --workdir .srs_formalizer` | 节点/边风险评分 |

## Backend

| 命令 | 功能 |
|------|------|
| `npx tsx index.ts emit --name <emitter> --workdir .srs_formalizer` | 单 Emitter 发射（Cypher/Gherkin/TLA+/Lean/Fixture...） |
| `npx tsx index.ts emit --group graphs\|bdd\|formal\|vmodel\|verify --workdir .srs_formalizer` | 分组发射 |
| `npx tsx index.ts emit --group all --workdir .srs_formalizer` | 发射所有 registry Emitter（仅生成 draft 或确定性产物） |

## Validate

| 命令 | 功能 |
|------|------|
| `npx tsx index.ts validate-jsonl --file <path> --workdir .srs_formalizer` | JSONL 格式校验（6 项） |
| `npx tsx index.ts validate-architecture --file <path> --workdir .srs_formalizer` | 架构 JSONL 校验（6 项 + 循环检测） |
| `npx tsx index.ts validate-cypher --file <path> --workdir .srs_formalizer` | Cypher 脚本校验（4 项） |
| `npx tsx index.ts validate-bdd --strict --promote --workdir .srs_formalizer` | 严格验证 draft BDD 并原子提升到 verified；不带 `--promote` 时验证 verified |
| `npx tsx index.ts validate-tla --name <module> --strict --promote --workdir .srs_formalizer` | 静态审核后用内置 `tla2tools-1.7.4.jar` 运行 SANY 与 TLC；matching draft `.tla`/`.cfg` 都通过后才提升 |
| `npx tsx index.ts validate-lean --strict --promote --workdir .srs_formalizer` | 审计带 `lakefile.lean` 或 `lakefile.toml` 的 draft Lean 项目、执行 `lake build` 并成功提升至 verified（❌ Windows 不支持） |
| `npx tsx index.ts validate-glossary --file <path> [--min-high N]` | 术语表批次 JSON 校验（8 项 + 门禁） |
| `npx tsx index.ts validate-checklist --file <path> --workdir .srs_formalizer` | CHECKLIST 完成度校验 |

## Gate

| 命令 | 功能 |
|------|------|
| `npx tsx index.ts verify-gate --workdir .srs_formalizer --stage S1\|R3\|FINAL` | hard gate；FINAL 仅接受内容 hash 与成功报告 `sourceHash` 匹配的 verified 形式化产物 |

## 维护

| 命令 | 功能 |
|------|------|
| `npx tsx index.ts pack-skill --skill-dir <path> [--force]` | 技能打包 + 加密备份 |
| `npx tsx index.ts verify-skill-integrity --skill-dir <path> [--repair]` | 技能完整性校验 + 自动修复 |
| `npx tsx index.ts capability-probe --mode generate\|score [--file <path>] [--workdir .srs_formalizer]` | LLM 能力探测（8 维度 50 题） |
