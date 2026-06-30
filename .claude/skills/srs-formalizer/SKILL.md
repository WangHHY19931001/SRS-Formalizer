---
name: srs-formalizer
description: 当用户提供 SRS（软件需求规格说明）文档并要求生成形式化产出时使用——包括需求知识图谱、BDD 特性文件、TLA+ 形式化规约或 Lean 4 算法证明。触发条件：用户上传或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"。
---

# SRS Formalizer

## 概述

将 SRS 文档转化为四类形式化产出：需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约（条件触发）、Lean 4 证明（条件触发）。TS 脚本做确定性机械工作，LLM 子代理做语义判断，编排者做流程决策。

## 工作流（S0 发现 → 六阶段，S2 内含七子阶段三精化循环）

```
S0 发现确认 → S1 预处理 → S2 需求提取+架构分解 → S3 图谱构建 → S4 BDD生成 → S5 形式化 → S6 验收闸门

S0: 扫描SRS、检测TLA+/Lean触发条件、向用户确认后再开始
S2 子阶段:
  S2.1 R1显式 → S2.2 架构分解-1 → S2.3 R2隐式 → S2.4 架构精化-2 → S2.5 R3关系-1 → S2.6 架构终核-3 → S2.7 R3关系-2
```

## 设计模式
- **Inversion（逆向澄清）**：S0 阶段确认输入和触发条件，信息不全不进 S1
- **Generator（模板化输出）**：executor 提示词采用零自由度填空模板，禁止增减字段
- **Reviewer（审查分离）**：verifier 提示词采用可执行 checklist，全部打勾才 APPROVED
- **Pipeline（流水线门禁）**：每阶段产物有对应硬门禁，不通过阻断后续
- **To Wrapper（按需注入）**：提示词 L3 渐进加载，编排者只加载当前阶段所需

## 工作目录结构（阶段前缀）

```
.srs_formalizer/
├── 1_shard/              # S1: 分片文件（含源位置头部）
├── 2_extract/
│   ├── r1-explicit/      # S2.1: R1 显式需求 JSONL
│   ├── architecture/     # S2.2/2.4/2.6: 架构分解 JSONL（arch-1/2/3）
│   ├── r2-implicit/      # S2.3: R2 隐式需求 JSONL
│   └── r3-relational/    # S2.5/2.7: R3 关系需求 JSONL
├── 3_graph/
│   ├── graph/            # S3: 图谱文件 + 合并日志
│   └── analysis/         # S3: 结构/语义分析 + 子代理提示词
├── 4_bdd/
│   └── features/         # S4: .feature 文件
├── 5_formal/
│   ├── specs/            # S5: TLA+ 规约
│   └── proofs/           # S5: Lean 4 证明
└── 6_outputs/            # S6: 知识图谱 Cypher + 头脑风暴上下文
```

阶段号前缀方便快速排查——`ls` 一眼看出每个阶段是否存在。

## 分片 ID 规则

- manifest 生成安全顺序 ID：`S001`~`S999`（纯 ASCII）
- 每个分片头部标注：`# source: <绝对路径>:<起始行>-<结束行>`
- `shard_index.json` 报告 `total_shards`，子代理可据此检测遗漏
- 子代理 R1 提取时 ID 格式：`R1-<shard_id>-NNNN`（如 `R1-S001-0001`）
- ID 严格匹配正则 `^R[123]-[A-Za-z0-9_.]+-\d{4}$`，禁止中文

## S1 阶段：预处理

| 命令 | 功能 |
|------|------|
| `init --output .srs_formalizer` | 初始化阶段前缀目录结构 |
| `manifest --src <path> --lang zh\|en --workdir .srs_formalizer` | SRS 分片 + 章节识别 + 缺口检测 + 源位置标注 |

## 核心原则

- **TS 脚本只做确定性转换**，不调用 LLM、不产生随机性、不依赖外部 API
- **所有文件操作限定在 `.srs_formalizer/` 工作目录内**
- **子代理输出必须通过 JSONL 格式校验**（硬门禁）
- **子代理 ID 必须 ASCII-only**（`validate-jsonl` 拒绝中文 ID）
- **SRS 回写必须经用户确认**，禁止自动修改原始 SRS
- **仅依赖 `typescript` + `@types/node`**，无外部 npm 包

## 依赖技能

**必需背景：** superpowers:test-driven-development、superpowers:verification-before-completion
**调用链：** S2~S4 调用 superpowers:writing-plans、superpowers:executing-plans；S5 调用 superpowers:systematic-debugging

## 快速参考

| 命令 | 功能 | 阶段 |
|------|------|------|
| `init --output .srs_formalizer` | 初始化工作目录 | S1 |
| `manifest --src <path> --lang zh\|en --workdir .srs_formalizer` | SRS 分片 + 章节识别 + 源位置标注 | S1 |
| `inject-prompt --template <path> --params '<json>'` | 填充子代理提示词模板 | S2 |
| `validate-jsonl --file <path> --workdir .srs_formalizer` | JSONL 格式校验（6 项） | S2 |
| `build-graph --workdir .srs_formalizer` | JSONL → 需求图谱 | S3 |
| `analyze-structure --workdir .srs_formalizer` | 孤立/悬挂/孤岛检测 | S3 |
| `merge-structure --workdir .srs_formalizer` | 结构补全合并 | S3 |
| `analyze-graph --workdir .srs_formalizer` | Jaccard 去重 + 反义检测 | S3 |
| `merge-analysis --workdir .srs_formalizer` | 语义判定合并 | S3 |
| `export-cypher --workdir .srs_formalizer` | 图谱 → Cypher 脚本 | S3 |
| `generate-bdd --workdir .srs_formalizer` | 图谱 → BDD 骨架 | S4 |
| `validate-bdd --workdir .srs_formalizer` | Gherkin 格式校验 | S4 |
| `query-graph --workdir .srs_formalizer --query <type> --params '<json>'` | 图谱只读查询 | S6 |
| `verify-gate --workdir .srs_formalizer --stage S1\|R3\|FINAL` | 硬门禁检查 | S1/S3/S6 |

## 文件体系

| 文件 | 用途 |
|------|------|
| `prompts/orchestrator_stage_S*.md` | 各阶段编排者指令（L3 按需加载） |
| `prompts/executor-R*.md` | 执行者子代理提示词 |
| `prompts/verifier-R*.md` | 校验者子代理提示词 |
| `prompts/debug-*.md` | TLC/Lean 错误诊断提示词 |
| `references/srs-chapter-guide.md` | SRS 章节识别规范参考 |
| `references/cypher-syntax.md` | Cypher 语法参考 |
| `references/gherkin-syntax.md` | Gherkin 语法参考 |
| `references/tlaplus-guide.md` | TLA+ 编写指南 |
| `references/lean4-guide.md` | Lean 4 编写指南 |
| `references/agent-integration-guide.md` | **Agent 集成指南**：15 平台技能目录、规则注入、AGENTS.md 配置 |
| `references/hooks-integration.md` | **Hooks+Commands+Agents 协同**：强制激活钩子、斜杠命令、子代理分工 |
| `templates/*.md.template` | 产出文件模板 |

## 激活策略（四层协同）

仅靠 SKILL.md description 匹配，激活率约 25%。建议部署完整四层架构：

| 层 | 机制 | 作用 | 配置位置 |
|----|------|------|---------|
| **Hooks** | `UserPromptSubmit` 强制评估 | 检测 SRS 关键词 → 必然激活技能 | `.claude/settings.json` + `hooks/skill-forced-eval.js` |
| **Skills** | SKILL.md 知识注入 | 提供 6 阶段流水线规范 | `.claude/skills/srs-formalizer/` |
| **Commands** | `/srs-formalizer` 流程编排 | 一键触发完整工作流 | `.claude/commands/srs-formalizer.md` |
| **Agents** | `@srs-extractor` `@srs-verifier` | 并行提取 + 独立校验 | Agent 定义文件 |

详细配置参见 `references/hooks-integration.md`。
