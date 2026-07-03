# SRS-Formalizer

将 SRS（软件需求规格说明）文档转化为四类形式化产出的 AI Agent 技能：
**需求知识图谱**（Cypher）· **BDD 测试骨架**（Gherkin）· **TLA+ 规约** · **Lean 4 证明**

## 快速开始

```bash
# 安装依赖
cd .claude/skills/srs-formalizer/scripts && npm install

# 初始化工作目录
npx tsx index.ts init --output .srs_formalizer

# 索引化分片（支持 .md / .html / 多目录包）
npx tsx index.ts manifest --src <srs-file-or-dir> --lang zh --workdir .srs_formalizer

# 编译技能（v0.4.0+，安全注入 + 平台发射）
npx tsx index.ts compile --skill-dir .claude/skills/srs-formalizer --workdir .srs_formalizer

# 运行测试
npm test
```

## 流水线架构

```
S0(发现确认) → S1(索引化分片) → S2(需求提取+架构7子阶段) → S3(图谱构建)
→ S4(BDD生成) → S5(形式化/条件触发) → S6(验收闸门)
```

| 阶段              | 输入            | 产出                                                             |
| ----------------- | --------------- | ---------------------------------------------------------------- |
| **S0** Discovery  | SRS 文档        | 分析报告 + TLA+/Lean 触发判定                                    |
| **S1** Preprocess | 原始 SRS        | `shard_index.json`（索引化分片）+ `GLOSSARY.md`（术语表）        |
| **S2** Extract    | 分片索引        | R1 显式/R2 隐式/R3 关系需求 JSONL + 架构 JSONL                   |
| **S3** Graph      | 需求 JSONL      | 知识图谱 → Cypher 导出                                           |
| **S4** BDD        | 图谱            | `.feature` 文件 + `behavior-graph.json`（行为图谱）              |
| **S5** Formal     | 图谱 + 触发条件 | TLA+ `.tla` / Lean `.lean` + 交互图谱 / 证明依赖图谱（条件触发） |
| **S6** Gate       | 全阶段产物      | 系统架构图谱 + 一致性报告 + 收敛日志 + 交付物清单                |

## 30 个 CLI 命令（26 个流水线 + 4 个维护）

| 命令                        |   阶段   | 功能                                                      |
| --------------------------- | :------: | --------------------------------------------------------- |
| `init`                      |    S1    | 初始化 `.srs_formalizer/` 工作目录                        |
| `manifest`                  |    S1    | SRS 索引化分片 + 章节识别 + 缺口检测                      |
| _(子代理)_                  |    S1    | 并行分批复用 shards 提取术语 → `GLOSSARY.md`              |
| `validate-glossary`         |    S1    | 术语表批次 JSON 校验（8 项 + 门禁 ≥5 高置信度）           |
| `guided-extract`            |    S2    | 两步模式逐行提取：先 `--template` 获取 prompt，再 `--line` 校验追加 |
| `compile`                   |  加载时  | 编译 SKILL.md → SkIR + Anti-Skill 注入 + 平台发射         |
| `inject-prompt`             |    S2    | 模板参数注入（支持 `--shard-id` 自动解析）                |
| `validate-jsonl`            |    S2    | JSONL 6 项格式校验                                        |
| `validate-architecture`     |    S2    | 架构 JSONL 6 项校验 + 循环检测                            |
| `build-graph`               |    S3    | JSONL → 需求知识图谱                                      |
| `build-architecture`        |    S3    | 架构 JSONL → 架构图节点                                   |
| `analyze-structure`         |    S3    | 孤立/悬挂/孤岛检测                                        |
| `merge-structure`           |    S3    | 结构补全合并                                              |
| `analyze-graph`             |    S3    | Jaccard 去重 + 反义检测 + 同对象聚类                      |
| `merge-analysis`            |    S3    | 语义判定合并                                              |
| `export-cypher`             |    S3    | 图谱 → Neo4j Cypher 脚本                                  |
| `validate-cypher`           |    S3    | Cypher 脚本 4 项校验                                      |
| `generate-bdd`              |    S4    | 图谱 → Gherkin BDD 骨架                                   |
| `validate-bdd`              |    S4    | Gherkin 格式校验                                          |
| `build-behavior-graph`      |    S4    | BDD → 系统行为图谱 JSON + Cypher                          |
| `build-tla-graph`           |    S5    | TLA+ → 系统交互图谱（System/Actor/Action/Invariant）      |
| `build-lean-graph`          |    S5    | Lean 4 → 证明依赖图谱（Theorem/Lemma/Import）             |
| `validate-tla`              |    S5    | TLA+ SANY 语法解析 + TLC 模型检测（严格模式）             |
| `validate-lean`             |    S5    | Lean 4 lake build 编译验证（0 sorry/0 axiom/0 warnings）  |
| `build-system-architecture` |    S6    | 四层合成 → 系统架构图谱 + 一致性报告 + 收敛循环           |
| `query-graph`               |    S6    | 图谱只读查询（7 种）                                      |
| `verify-gate`               | S1/S3/S6 | 三级硬门禁检查（含全部图谱存在性 + 收敛状态）             |
| `validate-checklist`        |    S6    | 阶段验收 CHECKLIST 校验                                    |
| `capability-probe`          |    S0    | LLM 能力探测（8 维度 × 50 题，含 TLA+/Lean 4 工具链验证） |
| `pack-skill`                |   维护   | 技能打包备份（`--force` 强制覆盖）                         |
| `verify-skill-integrity`    |   维护   | 技能完整性校验（SKILL.md + 命令 + 依赖一致性）             |

## 安装技能

```bash
# 项目级安装
cp -r .claude/skills/srs-formalizer /your-project/.claude/skills/
```

## 技术栈

- **TypeScript 5.5+**（strict 模式）
- **Node.js ≥20**（ESM）
- **零外部 npm 依赖**（仅 `typescript` + `@types/node` 为 devDeps）
- **测试**：Node.js 原生 `node:test` + `node:assert`（299 用例）

## 版本历史

| 版本      | 日期       | 关键变更                                                                                                                                                                                                                           |
| --------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0.5.2** | 2026-07-02 | TLA+ 内置 JAR + 严格模式（-deadlock/禁止黑洞/奇迹/无限状态）、Lean 4 拆分证明四步法 + mathlib4 缓存、gherkin-lint BDD 严格模式（20 条规则）、S6 跨图一致性验证（10 个根本问题）、validate-tla/validate-lean 命令、Windows 平台限制 |
| **0.5.1** | 2026-07-02 | 50-probe 重写、TLA+/Lean 编码指南、递归分片(≤200行)、术语表并行提取、五层图谱体系、CLI 毒值防护、S6 收敛循环                                                                                                                       |
| **0.5.0** | 2026-07-01 | 分片索引化重构——`ShardEntry.locator` 格式 `{file_abspath}-{start}-{end}-{chunk_id}`，移除 `1_shard/` 目录，HTML 格式保留，`inject-prompt --shard-id` 自动解析                                                                      |
| **0.4.0** | 2026-07-01 | SkCC 方法论集成——`compile` 命令、SkIR 中间表示、Anti-Skill 安全注入（7 条规则）、Claude XML + Generic MD 双发射器                                                                                                                  |
| **0.3.0** | 2026-06-30 | 分片源位置标注、安全 ID（ASCII-only）、目录结构重构（阶段前缀）                                                                                                                                                                    |
| **0.2.0** | 2026-06-30 | S2 阶段：inject-prompt、validate-jsonl、executor/verifier 提示词                                                                                                                                                                   |
| **0.1.0** | 2026-06-30 | S1 基础设施：init、manifest、类型定义、安全库                                                                                                                                                                                      |

## 端到端使用示例引导

完整演示请参考 [examples/end-to-end-walkthrough.md](examples/end-to-end-walkthrough.md)。

该引导通过一个真实的中文 SRS 文档（电商订单系统），完整走通 **S0 发现确认 → S1 预处理 → S2 需求提取 → S3 图谱构建 → S4 BDD 生成 → S5 形式化 → S6 验收闸门** 全流程，展示每个阶段的输入、执行命令和产出物格式。

## Golden 标准参考

`tests/golden/` 目录存放各阶段的 **L4 验收用例**（Golden 标准），作为人工验收的断言基线。每个文件定义一组场景（输入 → 执行 → 验收断言），用于验证阶段产物的完整性和正确性。

| 文件               | 阶段 | 描述                                                                                       |
| ------------------ | :--: | ------------------------------------------------------------------------------------------ |
| `s1-preprocess.md` |  S1  | **预处理验收**：中文 SRS 单文件分片 + 缺口报告、确定性与幂等性、路径安全拒绝、参数缺失拒绝 |
| `s2-extraction.md` |  S2  | **需求提取验收**：R1 显式 / R2 隐式 / R3 关系需求提取、校验者编造数据拒绝、模板注入防护    |
| `s4-bdd.md`        |  S4  | **BDD 验收**：从图谱生成 Gherkin 骨架、`<THEN_PLACEHOLDER>` 检测、确定性校验、空图谱处理   |

## 目录参考

### `references/`（参考文档）

技能运行时的子代理参考指南，按阶段按需加载。

| 文件                         | 阶段 | 用途                                                                              |
| ---------------------------- | :--: | --------------------------------------------------------------------------------- |
| `srs-chapter-guide.md`       |  S1  | SRS 章节识别规范——标准章节编号模式                                                |
| `hooks-integration.md`       | 安装 | 多平台激活适配参考（Claude Code / Cursor / 手动）                                 |
| `auto-setup.md`              | 安装 | 编码智能体自动适配自配置指南                                                      |
| `agent-integration-guide.md` | 安装 | Agent 多平台集成差异参考（Cline / Roo Code / GenAI / ...）                        |
| `capability-adaptation.md`   |  S0  | LLM 能力分级适配方案——根据能力探测结果调整行为                                    |
| `tlaplus-coding-guide.md`    |  S5  | TLA+ 编码指南（S5 TLA+ 触发时加载给子代理）                                       |
| `lean4-coding-guide.md`      |  S5  | Lean 4 编码指南（拆分证明四步法 + mathlib4 缓存，S5 Lean 证明触发时加载给子代理） |
| `gherkin-lint-guide.md`      |  S4  | Gherkin Lint 参考指南（严格模式配置 + 规则说明，S4 BDD 校验时加载）               |

### `templates/`（产出模板）

| 文件 / 目录              | 用途                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `.gherkin-lintrc`        | srs-formalizer 推荐 BDD 校验配置                                |
| `.gherkin-lintrc-strict` | 严格模式配置（全部 20 条规则 + 禁止 GAP/PLACEHOLDER/UNDEFINED） |

| 文件 / 目录                | 用途                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `STATE.md.template`        | SRS Formalizer 状态追踪模板                                                               |
| `CONTEXT.md.template`      | SRS 术语表与切片索引模板                                                                  |
| `GAPS.md.template`         | 信息缺口追踪模板                                                                          |
| `MINDMAP.md.template`      | SRS 结构总览模板                                                                          |
| `BEHAVIORS.md.template`    | BDD 分层建模索引模板                                                                      |
| `SPECS.md.template`        | TLA+ 规约索引模板                                                                         |
| `PROOFS.md.template`       | Lean 4 证明索引模板                                                                       |
| `RESEARCH_LOG.md.template` | 深度研究日志模板                                                                          |
| `checklists/`              | 7 份阶段验收 CHECKLIST（S0 发现 → S6 验收闸门），`init` 时按阶段复制到 `.srs_formalizer/` |

## S4 / S5 形式化质量保障（严格模式）

### S4 BDD（gherkin-lint 严格模式）

BDD 校验使用 `gherkin-lint`，默认启用严格模式（全部 20 条可配置规则）：

- **禁止 GAP**：检测 `GAP`、`TODO`、`FIXME`、`TBD` 标记
- **禁止 PLACEHOLDER**：检测 `<THEN_PLACEHOLDER>` 等占位符
- **禁止未定义**：检测 `UNDEFINED`、`待定`、`未定义`、`待实现`
- **强制逻辑顺序**：Given → When → Then → And

配置文件：`templates/.gherkin-lintrc-strict`

### S5 TLA+（内置 JAR + 严格模式）

TLA+ 使用技能内置 `tools/tla2tools-1.7.4.jar`（仅需 Java，不限 OS）。
首次运行时自动尝试下载最新版；下载失败则使用内置版。

```bash
# SANY 语法解析 + TLC 模型检测（严格模式）
npx tsx index.ts validate-tla --file <file>.tla --workdir .srs_formalizer
```

严格模式检查：

- **禁止死锁（黑洞）**：`-deadlock` 标志
- **禁止无限状态**：状态空间必须有限
- **禁止奇迹**：不允许不可能的状态转换
- **禁止未定义**：TypeOK 不变式强制执行
- **禁止活锁（停滞）**：Stuttering 检测

### S5 Lean 4（平台限制）

| 平台         |           支持           |
| ------------ | :----------------------: |
| Linux x86_64 |            ✅            |
| macOS ARM64  |            ✅            |
| Windows      | ❌ 禁止（引导使用 WSL2） |

```bash
# lake build 编译验证
npx tsx index.ts validate-lean --file <file>.lean
```

### 能力探测

S0 阶段通过 `capability-probe` 探测 LLM 在 `logical_reasoning`、`state_machine_modeling`、`theorem_proving` 等维度的能力分数，决定 S5 是否触发。

## S6 收敛循环与跨图一致性验证

S6 阶段在全部图谱构建完成后，通过**语义验证**检查 **10 个根本问题** 是否可被联合回答。

验证不再仅检查图谱文件是否存在，而是深入检查：

- **节点标签匹配**：每道问题要求图谱包含相关类型的节点（如 Q1-Q3 要求 `Requirement`/`Feature` 标签，Q4 要求 `Theorem`/`Proof` 标签）
- **跨图边**：多图问题检查 `system-architecture.json` 中是否存在跨层连接（IMPLEMENTS/FORMALIZES/PROVES/REFINES）
- **最小节点阈值**：深层分析问题（如 Q6 TLA+ 内部行为）要求 ≥5 个相关节点

|  #  | 问题                                                             | 联合图谱               |
| :-: | ---------------------------------------------------------------- | ---------------------- |
| Q1  | 它是什么？（本质定义、核心定位）                                 | 需求 + 系统架构        |
| Q2  | 它做什么？（核心功能、主要作用）                                 | 需求 + 行为            |
| Q3  | 它能做什么？（具体能力、应用场景）                               | 需求 + 行为 + TLA+     |
| Q4  | 它为什么可以这样？（技术原理、论文URL、开源URL，含 Lean 4 建模） | Lean + 需求 + 联网搜索 |
| Q5  | 能不能和其他软件/工具联合使用？                                  | 系统架构 + TLA+        |
| Q6  | 它的内部行为是怎样的（TLA+ 多层子系统建模）                      | TLA+ + 系统架构        |
| Q7  | 它与其他系统如何交互（BDD+TLA+ 联合建模）                        | 行为 + TLA+            |
| Q8  | 它与外部如何交互（BDD+TLA+ 联合建模）                            | 行为 + TLA+ + 系统架构 |
| Q9  | 它的工作边界是什么（联合建模+边界条件）                          | 行为 + TLA+ + 系统架构 |
| Q10 | 它的兜底方案是什么（降级/回滚/恢复）                             | 需求 + 行为 + 系统架构 |

```bash
npx tsx index.ts build-system-architecture --workdir .srs_formalizer --iteration <N>
```

产物：`6_outputs/cross-graph-report.json` + `convergence-log.jsonl`

**不一致处理**：回退对应阶段修复 → 重新验证（≤5 次迭代）。≥3 次未收敛 → 苏格拉底拷问模式：

- 联网搜索确认事实（论文、开源实现、技术文档）
- 为每个缺口生成 3-4 个可选项 + 推荐项
- 通过 `STATE.md` 向人类提问

**一致定义**：全部 10 个问题可回答 + 跨层边 > 0 + 高置信度 ≥ 7/10 + verify-gate FINAL 通过。

## 目录结构

```
.claude/skills/srs-formalizer/
├── SKILL.md              # 技能定义
├── CHANGELOG.md          # 版本变更
├── scripts/              # TypeScript 工具链
│   ├── index.ts          # CLI 入口
│   ├── commands/         # 30 个命令（含维护命令）
│   ├── lib/              # 库模块（graph, jsonl, bdd, anti-skill, emitters...）
│   ├── types/            # 类型定义（JsonlRecord, ShardEntry, SkIR...）
│   └── __tests__/        # 299 个测试（35 文件）
├── tools/                # 内置工具（tla2tools-1.7.4.jar）
├── prompts/              # LLM 提示词（编排者 + 执行者 + 校验者）
├── references/           # 参考文档（含 gherkin-lint / TLA+ / Lean 4 编码指南）
├── templates/            # 产出模板 + CHECKLIST + .gherkin-lintrc-strict
└── tests/                # 验收用例 + Golden 文件
```

## 致谢

### 开发工具链

| 项目                                                                                                                   | 说明                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **TypeScript** ([github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript))                            | strict 模式（v5.5）                                             |
| **Node.js** ([github.com/nodejs/node](https://github.com/nodejs/node))                                                 | ≥20 ESM 运行时                                                  |
| **tsx** ([github.com/privatenumber/tsx](https://github.com/privatenumber/tsx))                                         | TypeScript 执行器（基于 esbuild 即时编译）                      |
| **Prettier** ([github.com/prettier/prettier](https://github.com/prettier/prettier))                                    | 代码格式化——统一全项目风格                                      |
| **DefinitelyTyped** ([github.com/DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)) | `@types/node` 类型定义（v20.x）                                  |

### 形式化工具

| 项目                                                                                                        | 阶段 | 说明                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | :--: | --------------------------------------------------------------------------------------- |
| **TLA+** ([github.com/tlaplus/tlaplus](https://github.com/tlaplus/tlaplus))                                 |  S5  | 形式化规约语言——SANY 语法解析 + TLC 模型检测（严格模式：不允许黑洞/奇迹/无限状态/死锁） |
| **Lean 4** ([github.com/leanprover/lean4](https://github.com/leanprover/lean4))                             |  S5  | 定理证明器——lake build 编译验证                                                         |
| **mathlib4** ([github.com/leanprover-community/mathlib4](https://github.com/leanprover-community/mathlib4)) |  S5  | Lean 4 数学库——证明依赖的基础设施                                                       |
| **gherkin-lint** ([github.com/vsiakka/gherkin-lint](https://github.com/vsiakka/gherkin-lint))               |  S4  | BDD 特征文件校验——严格模式（不允许 GAP/未定义/PLACEHOLDER）                             |

### 方法论与设计

| 项目                                                                                                      | 说明                                                                                               |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Superpowers-ZH** ([github.com/jnMetaCode/superpowers-zh](https://github.com/jnMetaCode/superpowers-zh)) | 20 个 Superpowers 技能包加速了本项目的设计流程、代码审阅和开发迭代                                 |
| **SkCC 论文与实现**                                                                                       | 中山大学团队 SkCC 论文 (arXiv:2605.03353) 及 Nexa-Language/Skill-Compiler 开源实现——编译方法论基础 |
| **grill-me / grill-with-docs**                                                                            | 部分方法论参考                                                                                     |

### 开发工具

| 项目                          | 说明                 |
| ----------------------------- | -------------------- |
| **Trae CN + GLM 5.2**         | 技能需求文档辅助编写 |
| **Claude Code + DeepSeek V4** | 技能实际开发环境     |

## 许可

本项目采用 [MIT 协议](LICENSE) 开源。

## 参考

- **SkCC 论文**: [arXiv:2605.03353](https://arxiv.org/abs/2605.03353) — 编译方法论基础
- **SkCC 源码**: [github.com/Nexa-Language/Skill-Compiler](https://github.com/Nexa-Language/Skill-Compiler)
- **SkillsBench**: [arXiv:2602.12670](https://arxiv.org/abs/2602.12670) — Agent 技能基准
- **Agent Skills 规范**: [agentskills.io](https://agentskills.io/)
