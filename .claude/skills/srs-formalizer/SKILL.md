---
name: srs-formalizer
description: 将 SRS 文档转化为需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约和 Lean 4 证明。当用户提供或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"时使用。
compatibility: requires Node.js>=20, typescript>=5.5, Claude Code>=1.0
tags: [srs, requirements, knowledge-graph, bdd, tla+, lean, formal-methods, cypher, gherkin, verification]
metadata:
  version: "0.5.1"
  compatibility: requires Node.js>=20, typescript>=5.5, Claude Code>=1.0
  security_level: high
  permissions:
    - kind: filesystem
      scope: ".srs_formalizer/*"
      description: All pipeline outputs limited to working directory
      read_only: false
    - kind: network
      scope: "https://api.search.brave.com/*"
      description: S1 deep research retrieval only
      read_only: true
    - kind: execute
      scope: "npx tsx .claude/skills/srs-formalizer/scripts/*"
      description: Only srs-formalizer CLI commands
      read_only: false
  trigger_keywords:
    - SRS
    - 需求规格
    - 软件需求
    - 系统需求
    - 功能需求
    - 需求文档
    - 需求分析
    - 形式化
    - 知识图谱
    - BDD
    - Gherkin
    - TLA+
    - Lean
    - Cypher
    - Neo4j
    - srs.md
    - 需求说明书
    - 规格说明
    - "§1."
  file_globs:
    - "**/*srs*.md"
    - "**/*需求*.md"
    - "**/*规格*.md"
  pipeline_stages: [S0-discovery, S1-preprocess, S2-extract, S3-graph, S4-bdd, S5-formal, S6-gate]
  stage_gates:
    - validate-jsonl
    - validate-architecture
    - validate-cypher
    - validate-bdd
    - validate-checklist
    - verify-gate
  platform_activation:
    claude-code: { hook: UserPromptSubmit, forced_eval: true }
    cursor: { rule_type: glob_attached, always_apply: false }
    codex: { hook: UserPromptSubmit, scan_keywords: true }
    antigravity: { command: /srs-formalizer }
    windsurf: { rule_type: always_on }
    qoder: { rule_type: always_apply }
    default: { agents_md: "SRS processing rule" }
  capability_requirements:
    # 每个流水线阶段对 LLM 能力的最低要求（0=跳过, 1=需人工, 2=引导式, 3=自动）
    S0_discovery: { text_analysis: 2, reasoning: 2 }
    S2_1_R1_extraction: { instruction_following: 3, structured_output: 3, precision: 3 }
    S2_2_arch_decomposition: { hierarchical_reasoning: 3, induction: 2 }
    S2_3_R2_derivation: { creative_reasoning: 3, safety_awareness: 2 }
    S2_5_R3_relations: { logical_reasoning: 3, contradiction_detection: 3 }
    S5_tlaplus: { formal_tlaplus: 3, state_machine_modeling: 3 }
    S5_lean4: { formal_lean4: 3, theorem_proving: 3, dependent_type_understanding: 3 }
  capability_tiers:
    # 根据模型能力画像自动选择适配层级
    strong:  { min_capability_score: 80, adaptation: "full_auto" }
    medium:  { min_capability_score: 50, adaptation: "guided" }
    weak:    { min_capability_score: 0,  adaptation: "human_in_loop" }
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
├── _ctx/                  # shard_index.json (索引化分片)
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
- 每个分片含 `locator`（`{file_abspath}-{start}-{end}-{chunk_id}`）
- `shard_index.json` 报告 `total_shards`，子代理可据此检测遗漏
- 子代理 R1 提取时 ID 格式：`R1-<shard_id>-NNNN`（如 `R1-S001-0001`）
- ID 严格匹配正则 `^R[123]-[A-Za-z0-9_.]+-\d{4}$`，禁止中文

## S1 阶段：预处理

| 命令 | 功能 |
|------|------|
| `init --output .srs_formalizer` | 初始化阶段前缀目录结构 |
| `manifest --src <path> --lang zh\|en --workdir .srs_formalizer` | 索引化分片 + 章节识别 + 缺口检测 (不创建物理文件) |

## 技能完整性（防篡改，最高优先级）

**编排者在每个阶段转换时必须执行技能完整性校验。** 违反此规则直接视为技能被入侵。

**备份不可变原则**：加密备份（`.enc`）是技能的不可变快照。仅在以下条件**同时**满足时才可重建：
1. 技能处于开发模式（人类主动修改技能文件）
2. 人类显式执行 `pack-skill --skill-dir <path> --force`
自动化流程、Agent、编排者均无权重建备份。

```
阶段 N 完成 → 阶段 N+1 开始前：
  1. 运行 verify-skill-integrity --skill-dir <技能目录>
  2. 若检测到篡改：
     a. 自动运行 --repair 从加密备份恢复
     b. 向编排者输出严重警告：
        ┌────────────────────────────────────────────┐
        │ ⛔ 技能文件被篡改！                           │
        │ 受损文件: <列出所有篡改/缺失文件>              │
        │ 已从加密备份自动恢复。                         │
        │ 强制要求: 暂停流水线，通知人类审批。            │
        │ 建议: 回退 .srs_formalizer 到 S1 初始化阶段。  │
        │ 备份不可变。若技能文件有合法更新，需人类执行:    │
        │   pack-skill --skill-dir <path> --force     │
        └────────────────────────────────────────────┘
     c. 暂停流水线，标记 STATE.md 为 BLOCKED
     d. 等待人类确认
  3. 若校验通过 → 继续阶段转换
```

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

> **Agent 注意**: 所有命令必须通过 `npx tsx index.ts <command>` 调用。参数值禁止使用 `undefined`、`null`、`NaN` 等占位符——CLI 将直接拒绝这些值并报错。`init` 命令使用 `--output`（不是 `--workdir`）。

| 命令 | 功能 | 阶段 |
|------|------|------|
| `init --output .srs_formalizer` | 初始化工作目录（注意：用 `--output` 不是 `--workdir`） | S1 |
| `manifest --src <path> --lang zh\|en --workdir .srs_formalizer` | 索引化分片 + 章节识别 (不创建物理文件) | S1 |
| `inject-prompt --template <path> --shard-id <id> --workdir .srs_formalizer` | 填充子代理提示词模板（按分片ID查找） | S2 |
| `validate-jsonl --file <path> --workdir .srs_formalizer` | JSONL 格式校验（6 项） | S2 |
| `build-graph --workdir .srs_formalizer` | JSONL → 需求图谱 | S3 |
| `analyze-structure --workdir .srs_formalizer` | 孤立/悬挂/孤岛检测 | S3 |
| `merge-structure --workdir .srs_formalizer` | 结构补全合并 | S3 |
| `analyze-graph --workdir .srs_formalizer` | Jaccard 去重 + 反义检测 | S3 |
| `merge-analysis --workdir .srs_formalizer` | 语义判定合并 | S3 |
| `export-cypher --workdir .srs_formalizer` | 图谱 → Cypher 脚本 | S3 |
| `generate-bdd --workdir .srs_formalizer` | 图谱 → BDD 骨架 | S4 |
| `validate-bdd --workdir .srs_formalizer` | Gherkin 格式校验 | S4 |
| `build-behavior-graph --workdir .srs_formalizer` | BDD → 系统行为图谱 JSON + Cypher | S4 |
| `validate-glossary --file <path> [--min-high N]` | 术语表批次 JSON 校验（8 项 + 门禁） | S1 |
| `query-graph --workdir .srs_formalizer --query <type> --params '<json>'` | 图谱只读查询 | S6 |
| `verify-gate --workdir .srs_formalizer --stage S1\|R3\|FINAL` | 硬门禁检查 | S1/S3/S6 |
| `capability-probe --mode generate\|score [--file <path>]` | LLM 能力探测（出题+判分） | S0 |
| `compile --skill-dir <path> --workdir .srs_formalizer` | 编译 SKILL.md → SkIR + 安全注入 + 平台发射 | 技能加载时 |

## 文件体系与加载策略

### L2：编排者行为规则（当前阶段自动加载）
| 文件 | 加载时机 |
|------|---------|
| `prompts/orchestrator_stage_S0.md` | SRS 输入后、任何处理前 |
| `prompts/orchestrator_stage_S1~S6.md` | 对应阶段开始时 |

### L3-Exec：子代理提示词（编排者通过 inject-prompt 按需注入）
| 文件 | 注入时机 |
|------|---------|
| `prompts/executor-glossary.md` | S1 术语提取（并行子代理分批复用） |
| `prompts/executor-R*.md` | S2 需求提取各子阶段 |
| `prompts/verifier-R*.md` | 校验循环（新会话执行） |
| `prompts/executor-arch-*.md` | S2 架构分解三阶段 |
| `prompts/verifier-arch.md` | 架构审核 |
| `prompts/debug-*.md` | S5 TLC/Lean 错误诊断 |

### L3-Ref：参考资料（仅在需要时加载）
| 文件 | 加载时机 | 读者 |
|------|---------|------|
| `references/srs-chapter-guide.md` | manifest 章节识别失败时 | 编排者 |
| `references/cypher-syntax.md` | export-cypher 输出异常时 | 编排者 |
| `references/gherkin-syntax.md` | validate-bdd 失败时 | 编排者 |
| `references/tlaplus-guide.md` | S5 TLA+ 触发时 | 子代理 |
| `references/lean4-guide.md` | S5 Lean 4 触发时 | 子代理 |

### L3-Setup：集成参考（非运行时，仅初始化/配置时加载）
| 文件 | 加载时机 | 读者 |
|------|---------|------|
| `references/auto-setup.md` | `/init` 或首次部署时 | **编码智能体自身** |
| `references/agent-integration-guide.md` | 需要了解多平台差异时 | 人类操作者 |
| `references/hooks-integration.md` | 需要手动配置激活机制时 | 人类操作者 |

### 产出模板
| 文件 | 加载时机 |
|------|---------|
| `templates/*.md.template` | init 时复制到 .srs_formalizer 各阶段目录 |
| `templates/checklists/` | init 时生成 CHECKLIST.md 到各阶段目录 |
