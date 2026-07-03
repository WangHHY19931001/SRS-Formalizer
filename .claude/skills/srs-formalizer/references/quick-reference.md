# SRS-Formalizer 命令快速参考

> **Agent 注意**: 所有命令必须通过 `npx tsx index.ts <command>` 调用。参数值禁止使用 `undefined`、`null`、`NaN` 等占位符——CLI 将直接拒绝这些值并报错。`init` 命令使用 `--output`（不是 `--workdir`）。

| 命令                                                                                                                  | 功能                                                                             | 阶段       |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| `npx tsx index.ts init --output .srs_formalizer`                                                                      | 初始化工作目录（注意：用 `--output` 不是 `--workdir`）                           | S1         |
| `npx tsx index.ts manifest --src <path> --lang zh\|en --workdir .srs_formalizer`                                      | 索引化分片 + 章节识别 (不创建物理文件)                                           | S1         |
| `npx tsx index.ts inject-prompt --template <path> --shard-id <id> --workdir .srs_formalizer`                          | 填充子代理提示词模板（按分片ID查找）                                             | S2         |
| `npx tsx index.ts guided-extract --template <path> --shard-id <id> --type r1\|r2\|r3\|arch --workdir .srs_formalizer` | 生成 guided prompt（发给 LLM 逐行提取）                                          | S2         |
| `npx tsx index.ts guided-extract --line '<json>' --shard-id <id> --type r1\|r2\|r3\|arch --workdir .srs_formalizer` | 处理单行 JSON（校验+追加到输出文件），返回 OK/ERR/DONE，agent 用 run_command 逐行调用 | S2         |
| `npx tsx index.ts validate-jsonl --file <path> --workdir .srs_formalizer`                                             | JSONL 格式校验（6 项）                                                           | S2         |
| `npx tsx index.ts validate-architecture --file <path> --workdir .srs_formalizer`                                      | 架构 JSONL 校验（6 项 + 循环检测）                                               | S2         |
| `npx tsx index.ts build-graph --workdir .srs_formalizer`                                                              | JSONL → 需求图谱                                                                 | S3         |
| `npx tsx index.ts build-architecture --workdir .srs_formalizer`                                                       | 架构 JSONL → 架构图节点                                                          | S3         |
| `npx tsx index.ts analyze-structure --workdir .srs_formalizer`                                                        | 孤立/悬挂/孤岛检测                                                               | S3         |
| `npx tsx index.ts merge-structure --workdir .srs_formalizer`                                                          | 结构补全合并                                                                     | S3         |
| `npx tsx index.ts analyze-graph --workdir .srs_formalizer`                                                            | Jaccard 去重 + 反义检测                                                          | S3         |
| `npx tsx index.ts merge-analysis --workdir .srs_formalizer`                                                           | 语义判定合并                                                                     | S3         |
| `npx tsx index.ts export-cypher --workdir .srs_formalizer`                                                            | 图谱 → Cypher 脚本                                                               | S3         |
| `npx tsx index.ts validate-cypher --file <path> --workdir .srs_formalizer`                                            | Cypher 脚本校验（4 项）                                                          | S3         |
| `npx tsx index.ts generate-bdd --workdir .srs_formalizer`                                                             | 图谱 → BDD 骨架                                                                  | S4         |
| `npx tsx index.ts validate-bdd --workdir .srs_formalizer`                                                             | Gherkin 格式校验（严格模式: gherkin-lint 全部规则 + 禁止 GAP/PLACEHOLDER）       | S4         |
| `npx tsx index.ts build-behavior-graph --workdir .srs_formalizer`                                                     | BDD → 系统行为图谱 JSON + Cypher                                                 | S4         |
| `npx tsx index.ts build-tla-graph --workdir .srs_formalizer`                                                          | TLA+ → 系统交互图谱 JSON + Cypher                                                | S5         |
| `npx tsx index.ts build-lean-graph --workdir .srs_formalizer`                                                         | Lean 4 → 证明依赖图谱 JSON + Cypher                                              | S5         |
| `npx tsx index.ts validate-tla --file <path> --workdir .srs_formalizer`                                               | SANY 语法解析 + TLC 模型检测（严格模式: -deadlock, 禁止黑洞/奇迹/无限状态/死锁） | S5         |
| `npx tsx index.ts validate-lean --file <path>`                                                                        | lake build 编译验证（❌ Windows 不支持）                                         | S5         |
| `npx tsx index.ts build-system-architecture --workdir .srs_formalizer [--iteration N]`                                | 四层合成 → 系统架构图谱 + 一致性报告                                             | S6         |
| `npx tsx index.ts validate-glossary --file <path> [--min-high N]`                                                     | 术语表批次 JSON 校验（8 项 + 门禁）                                              | S1         |
| `npx tsx index.ts query-graph --workdir .srs_formalizer --query <type> --params '<json>'`                             | 图谱只读查询                                                                     | S6         |
| `npx tsx index.ts verify-gate --workdir .srs_formalizer --stage S1\|R3\|FINAL`                                        | gate condition 检查                                                              | S1/S3/S6   |
| `npx tsx index.ts validate-checklist --file <path> --workdir .srs_formalizer`                                         | CHECKLIST 完成度校验                                                             | S1/S3/S6   |
| `npx tsx index.ts pack-skill --skill-dir <path> [--force]`                                                            | 技能打包 + 加密备份                                                              | 维护       |
| `npx tsx index.ts verify-skill-integrity --skill-dir <path> [--repair]`                                               | 技能完整性校验 + 自动修复                                                        | 维护       |
| `npx tsx index.ts capability-probe --mode generate\|score [--file <path>] [--workdir .srs_formalizer]`                | LLM 能力探测（8 维度 50 题）                                                     | S0         |
| `npx tsx index.ts compile --skill-dir <path> --workdir .srs_formalizer`                                               | 编译 SKILL.md → SkIR + 安全注入 + 平台发射                                       | 技能加载时 |
