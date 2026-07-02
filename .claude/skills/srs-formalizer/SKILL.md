---
name: srs-formalizer
description: 将 SRS 文档转化为需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约和 Lean 4 证明。当用户提供或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"时使用。
compatibility: requires Node.js>=20, typescript>=5.5, Claude Code>=1.0
tags:
  [
    srs,
    requirements,
    knowledge-graph,
    bdd,
    tla+,
    lean,
    formal-methods,
    cypher,
    gherkin,
    verification,
  ]
metadata:
  version: "0.5.2"
  compatibility: requires Node.js>=20, typescript>=5.5, Claude Code>=1.0
  pattern: pipeline
  domain: formal-methods
  toxic_flow_analysis:
    accesses_private_data: false
    processes_untrusted_input: true
    can_external_communicate: true
  security_level: high
  hitl_required: true
  pre_conditions:
    - "SRS 文档必须存在且可读"
    - "Node.js >=20 环境就绪"
    - "S0 发现阶段完成用户确认"
  post_conditions:
    - "所有产物写入 .srs_formalizer/ 工作目录"
    - "verify-gate FINAL 全部通过"
    - "cross-graph-report.json 全部 10 个根本问题可回答"
    - "convergence-log.jsonl 记录迭代历史"
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
  pipeline_stages:
    [
      S0-discovery,
      S1-preprocess,
      S2-extract,
      S3-graph,
      S4-bdd,
      S5-formal,
      S6-gate,
    ]
  stage_gates:
    - validate-jsonl
    - validate-architecture
    - validate-cypher
    - validate-bdd
    - validate-tla
    - validate-lean
    - validate-checklist
    - validate-glossary
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
    S2_1_R1_extraction:
      { instruction_following: 3, structured_output: 3, precision: 3 }
    S2_2_arch_decomposition: { hierarchical_reasoning: 3, induction: 2 }
    S2_3_R2_derivation: { creative_reasoning: 3, safety_awareness: 2 }
    S2_5_R3_relations: { logical_reasoning: 3, contradiction_detection: 3 }
    S5_tlaplus: { formal_tlaplus: 3, state_machine_modeling: 3 }
    S5_lean4:
      { formal_lean4: 3, theorem_proving: 3, dependent_type_understanding: 3 }
  capability_tiers:
    # 根据模型能力画像自动选择适配层级
    strong: { min_capability_score: 80, adaptation: "full_auto" }
    medium: { min_capability_score: 50, adaptation: "guided" }
    weak: { min_capability_score: 0, adaptation: "human_in_loop" }
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

| 命令                                                                             | 功能                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------- |
| `npx tsx index.ts init --output .srs_formalizer`                                 | 初始化阶段前缀目录结构                            |
| `npx tsx index.ts manifest --src <path> --lang zh\|en --workdir .srs_formalizer` | 索引化分片 + 章节识别 + 缺口检测 (不创建物理文件) |

## 技能完整性（防篡改，最高优先级）

**编排者在每个阶段转换时必须执行技能完整性校验。** 违反此规则直接视为技能被入侵。

**备份不可变原则**：加密备份（`.enc`）是技能的不可变快照。仅在以下条件**同时**满足时才可重建：

1. 技能处于开发模式（人类主动修改技能文件）
2. 人类显式执行 `npx tsx index.ts pack-skill --skill-dir <path> --force`
   自动化流程、Agent、编排者均无权重建备份。

```
阶段 N 完成 → 阶段 N+1 开始前：
  1. 运行 npx tsx index.ts verify-skill-integrity --skill-dir <技能目录>
  2. 若检测到篡改：
     a. 自动运行 npx tsx index.ts verify-skill-integrity --repair 从加密备份恢复
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

## S4 / S5 严格模式

### S4 BDD 严格模式（gherkin-lint）

BDD 校验使用 `gherkin-lint`（[GitHub](https://github.com/vsiakka/gherkin-lint)）。默认启用严格模式：

- **禁止 GAP**：检测 `GAP`、`TODO`、`FIXME`、`TBD` 标记
- **禁止 PLACEHOLDER**：检测 `<THEN_PLACEHOLDER>`、`<GIVEN_PLACEHOLDER>` 等占位符
- **禁止未定义**：检测 `UNDEFINED`、`待定`、`未定义`、`待实现`
- **禁止未使用变量**：Scenario Outline 变量必须全部使用
- **强制逻辑顺序**：Given → When → Then → And

配置文件：`templates/.gherkin-lintrc-strict`（全部 20 条规则）

### S5 TLA+ 严格模式

TLA+ 使用内置 `tla2tools-1.7.4.jar`（`tools/` 目录）。仅需 Java（不限 OS）。

- **禁止死锁（黑洞）**：`-deadlock` 标志
- **禁止无限状态**：状态空间必须有限
- **禁止奇迹**：不允许不可能的状态转换
- **禁止未定义**：TypeOK 不变式强制执行
- **禁止活锁（停滞）**：Stuttering 检测

### S5 Lean 4 平台限制

| 平台         |         支持         |
| ------------ | :------------------: |
| Linux x86_64 |          ✅          |
| macOS ARM64  |          ✅          |
| Windows      | ❌ 禁止（使用 WSL2） |

安装后执行 `lake exe cache get` 下载 mathlib4 编译缓存（避免从源码编译）。

Lean 4 必须使用拆分证明四步法（骨架→拆分→递归至0 sorry），详见 `references/lean4-coding-guide.md`。

### S6 跨图一致性验证（10 个根本问题）

S6 收敛循环验证全部图谱是否可联合回答 10 个根本问题（详见 `lib/cross-graph-verifier.ts`）：

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

不可回答 → 回退对应阶段修复。≥3 次未收敛 → 苏格拉底拷问（联网搜索 + 可选项 + 推荐）+ 人类决策。

## 核心原则

- **TS 脚本只做确定性转换**，不调用 LLM、不产生随机性、不依赖外部 API
- **所有文件操作限定在 `.srs_formalizer/` 工作目录内**
- **子代理输出必须通过 JSONL 格式校验**（硬门禁）
- **子代理 ID 必须 ASCII-only**（`validate-jsonl` 拒绝中文 ID）
- **SRS 回写必须经用户确认**，禁止自动修改原始 SRS
- **技能工程零运行时 npm 依赖**（`typescript` + `@types/node` 仅为 devDeps）

## 依赖技能

**必需背景：** superpowers:test-driven-development、superpowers:verification-before-completion
**调用链：** S2~S4 调用 superpowers:writing-plans、superpowers:executing-plans；S5 调用 superpowers:systematic-debugging

## 快速参考

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
| `npx tsx index.ts verify-gate --workdir .srs_formalizer --stage S1\|R3\|FINAL`                                        | 硬门禁检查                                                                       | S1/S3/S6   |
| `npx tsx index.ts validate-checklist --file <path> --workdir .srs_formalizer`                                         | CHECKLIST 完成度校验                                                             | S1/S3/S6   |
| `npx tsx index.ts pack-skill --skill-dir <path> [--force]`                                                            | 技能打包 + 加密备份                                                              | 维护       |
| `npx tsx index.ts verify-skill-integrity --skill-dir <path> [--repair]`                                               | 技能完整性校验 + 自动修复                                                        | 维护       |
| `npx tsx index.ts capability-probe --mode generate\|score [--file <path>] [--workdir .srs_formalizer]`                | LLM 能力探测（8 维度 50 题）                                                     | S0         |
| `npx tsx index.ts compile --skill-dir <path> --workdir .srs_formalizer`                                               | 编译 SKILL.md → SkIR + 安全注入 + 平台发射                                       | 技能加载时 |

## 文件体系与加载策略

### L2：编排者行为规则（当前阶段自动加载）

| 文件                                  | 加载时机               |
| ------------------------------------- | ---------------------- |
| `prompts/orchestrator_stage_S0.md`    | SRS 输入后、任何处理前 |
| `prompts/orchestrator_stage_S1~S6.md` | 对应阶段开始时         |

### L3-Exec：子代理提示词（编排者通过 inject-prompt 按需注入）

| 文件                           | 注入时机                          |
| ------------------------------ | --------------------------------- |
| `prompts/executor-glossary.md` | S1 术语提取（并行子代理分批复用） |
| `prompts/executor-R*.md`       | S2 需求提取各子阶段               |
| `prompts/verifier-R*.md`       | 校验循环（新会话执行）            |
| `prompts/executor-arch-*.md`   | S2 架构分解三阶段                 |
| `prompts/verifier-arch.md`     | 架构审核                          |
| `prompts/debug-*.md`           | S5 TLC/Lean 错误诊断              |

### L3-Ref：参考资料（仅在需要时加载）

| 文件                                    | 加载时机                | 读者   |
| --------------------------------------- | ----------------------- | ------ |
| `references/srs-chapter-guide.md`       | manifest 章节识别失败时 | 编排者 |
| `references/capability-adaptation.md`   | capability-probe 判分后 | 编排者 |
| `references/tlaplus-coding-guide.md`    | S5 TLA+ 触发时          | 子代理 |
| `references/lean4-coding-guide.md`      | S5 Lean 4 触发时        | 子代理 |
| `references/gherkin-lint-guide.md`      | S4 BDD 校验时           | 子代理 |
| `references/hooks-integration.md`       | 技能安装/配置时         | 编排者 |
| `references/auto-setup.md`              | 编码智能体自配置时      | 子代理 |
| `references/agent-integration-guide.md` | 多平台集成时            | 编排者 |

### L3-Setup：集成参考（非运行时，仅初始化/配置时加载）

| 文件                                    | 加载时机               | 读者               |
| --------------------------------------- | ---------------------- | ------------------ |
| `references/auto-setup.md`              | `/init` 或首次部署时   | **编码智能体自身** |
| `references/agent-integration-guide.md` | 需要了解多平台差异时   | 人类操作者         |
| `references/hooks-integration.md`       | 需要手动配置激活机制时 | 人类操作者         |

### 产出模板

| 文件                      | 加载时机                                 |
| ------------------------- | ---------------------------------------- |
| `templates/*.md.template` | init 时复制到 .srs_formalizer 各阶段目录 |
| `templates/checklists/`   | init 时生成 CHECKLIST.md 到各阶段目录    |
