---
name: srs-formalizer
description: 将 SRS 文档转化为需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约和 Lean 4 证明。当用户提供或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"时使用。不应在以下场景触发：无 SRS 文档时、纯代码审查/调试、非技术文档（营销/法律）、用户仅需代码生成时。
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
  version: "0.5.5"
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
  fallbacks:
    - operation: "文件写入 (.srs_formalizer/)"
      strategy: "所有写入使用原子 temp-file + rename。init 幂等保留已有文件。"
    - operation: "图谱构建 (build-graph / build-architecture)"
      strategy: "构建失败时保留上一阶段有效产物，不回退已校验数据。"
    - operation: "收敛循环 (S6)"
      strategy: "最多 3 次迭代，超限触发苏格拉底拷问 + 人类决策。"
  input_schema:
    type: object
    properties:
      source:
        type: string
        description: "SRS 文件路径（.md/.html）或目录路径"
      lang:
        type: string
        enum: ["zh", "en"]
        description: "文档语言"
      stages:
        type: array
        items:
          type: string
          enum: ["S0", "S1", "S2", "S3", "S4", "S5", "S6"]
        description: "要执行的流水线阶段（默认全部）"
    required: ["source", "lang"]
  output_schema:
    type: object
    properties:
      knowledge_graph:
        type: object
        description: "Neo4j Cypher 知识图谱脚本"
      bdd:
        type: object
        description: "Gherkin .feature 行为驱动测试骨架"
      tlaplus:
        type: object
        description: "TLA+ 形式化规约（条件触发）"
      lean4:
        type: object
        description: "Lean 4 定理证明（条件触发）"
      verification_report:
        type: object
        description: "跨图一致性验证报告 (cross-graph-report.json)"
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
  negative_triggers:
    - 代码审查
    - code review
    - 调试
    - debug
    - 写代码
    - write code
    - 生成代码
    - generate code
    - marketing
    - 营销
    - legal
    - 法律
    - 合同
    - contract
    - 文案
    - copywriting
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

## 何时不该使用

本技能**不应**在以下场景激活（详见 frontmatter `negative_triggers`）：

1. **无 SRS 文档时**——没有需求规格说明输入，管线无法启动
2. **纯代码审查/调试**——这不是代码审查工具，不应在 PR review 或 bug 修复场景触发
3. **非技术文档**——营销文案、法律条款、合同文本不适合形式化处理
4. **用户仅需代码生成**——如果用户只要求写代码，不需要 SRS 形式化

## 工作流（S0 发现 → 六阶段，S2 内含七子阶段三精化循环）

```
S0 发现确认 → S1 预处理 → S2 需求提取+架构分解 → S3 图谱构建 → S4 BDD生成 → S5 形式化 → S6 验收闸门

S0: 扫描SRS、检测TLA+/Lean触发条件、向用户确认后再开始
S2 子阶段:
  S2.1 R1显式 → S2.2 架构分解-1 → S2.3 R2隐式 → S2.4 架构精化-2 → S2.5 R3关系-1 → S2.6 架构终核-3 → S2.7 R3关系-2
```

## 设计模式（嵌套组合）

主模式 `pipeline` — S0~S6 七阶段顺序执行，每阶段通过 stage_gates 拦截跳步。

嵌套于 pipeline 中的次模式：

- **Inversion（逆向澄清，嵌入 S0）**：在进入 S1 前强制 interview 模式，信息不全不进 S1
- **Generator（模板化输出，嵌入 S2~S5）**：executor 提示词采用零自由度填空模板，禁止增减字段
- **Reviewer（审查分离，嵌入各阶段 stage_gates）**：verifier 提示词采用可执行 checklist，全部打勾才 APPROVED
- **Tool Wrapper（工具包装器，全局嵌入）**：L3 渐进加载，编排者只加载当前阶段所需

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

## S4 BDD 建模（必选）

**格式要求：**
- 必须采用独立 `.feature` 文件格式建模，**不接受 Markdown 模式描述 BDD**
- 必须有完整步骤（Given → When → Then → And），必须完整定义状态和状态转换
- 必须通过 gherkin-lint 严格模式（20 条规则，配置 `templates/.gherkin-lintrc-strict`）

**质量门禁（全部必须通过）：**
- 不允许 `error`、`failed`、`undefined`、`untested`、步骤缺失——出现则需处理修正
- 不允许占位实现（如 `<THEN_PLACEHOLDER>`、`<GIVEN_PLACEHOLDER>`）、简化实现、错误实现
- 不允许 GAP / TODO / FIXME / TBD / 待定 / 未定义 / 待实现
- 行为图谱 `build-behavior-graph` 必须成功构建（含 Feature/Scenario/Action 节点）

**SRS 一致性问题：** 建模必须符合 SRS 设计并进一步细化。出现问题先检查建模与设计一致性；一致但仍有问题则与用户交互修正设计。

## S5 TLA+ 建模（条件触发：并发/分布式/共识协议）

**层次化拆解方法：**
- L1 系统内外交互抽象 → L2 子系统内部行为 + 上下同级交互抽象 → L3 原子化子系统行为抽象。可推广至 4/5/6 级或更多，每个下级子系统视为独立系统继续拆解
- 拆解判定：先写 TLA+，分析变量组合；组合结果 >1k 时考虑拆，>1w 时必须拆

**调试与验证流程：**
1. 删除旧的轨迹文件（`.stl`）和状态文件（`.tlc`）
2. 先通过 SANY 语法检查，再执行 TLC 模型检查
3. 失败 → `prompts/debug-tlc.md` 子代理定位根因 → 修正后回到步骤 1

**质量门禁（全部必须通过，`validate-tla` 严格模式）：**
- SANY 语法检查通过 + TLC 模型检查通过
- 不允许死锁（`-deadlock`）、状态爆炸、违法不变式（TypeOK）、活锁（停滞）、奇迹（不可能的状态转换）
- 不允许占位实现、简化实现、错误实现
- 正常系统不允许死锁。死锁或矛盾分支需定位根因修正

**SRS 一致性问题：** 建模必须符合 SRS 设计。符合设计但仍有问题的，需报告人类并给出可选项供修正 SRS。此部分允许联网搜索深度调研，但必须基于事实工作。

## S5 Lean 4 建模（条件触发：安全关键/密码学/自定义算法）

**平台限制：** ❌ Windows 禁止（引导使用 WSL2）。✅ Linux x86_64 / ✅ macOS ARM64。

**拆分证明方法（强制四步循环）：**
1. 编写证明骨架（带 `sorry`）
2. 将每个 `sorry` 变为独立文件证明
3. 若一个 theorem/lemma 无法搞定，拆分为多个文件分别证明，然后 `import`
4. 若仍有 `sorry`，回到步骤 1 继续拆分——递归至 0 个 sorry

**质量门禁（全部必须通过）：**
- 必须通过 `lake build` 编译验证
- 不允许算法实现错误、不完整实现、`sorry`、告警、`axiom`
- 不允许占位实现、简化实现、错误实现
- 不允许 `#eval` 替代 proof、不允许 `import Mathlib`（全量导入）
- 允许使用 mathlib4（最新版）
- 必须使用 `theorem` + 完整 `proof`，每个 lemma 独立文件证明（≤100 行）
- 每个修改后立即 `lake build`，不积攒

**SRS 一致性问题：** 建模必须符合 SRS 设计。符合设计但仍有问题的，写入 `SRS_PATCHES.md`（含矛盾描述、SRS 引用、可选项 A/B/C、事实依据），等待人类确认。此部分允许联网搜索深度调研，但必须基于事实工作。

## S6 收敛循环

详见 `references/strict-modes.md`——跨图一致性验证（10 个根本问题 + 收敛循环 + 苏格拉底拷问）。

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

完整的 30 条 CLI 命令参考表见 `references/quick-reference.md`。

> **Agent 注意**: 所有命令必须通过 `npx tsx index.ts <command>` 调用。参数值禁止使用 `undefined`、`null`、`NaN` 等占位符。`init` 命令使用 `--output`（不是 `--workdir`）。

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
| `prompts/executor-bdd.md`      | S4 BDD 生成（注入 BDD 专家人设） |
| `prompts/executor-tlaplus.md`  | S5 TLA+ 建模（注入 TLA+ 专家人设） |
| `prompts/executor-lean4.md`    | S5 Lean 4 证明（注入 Lean 4 专家人设） |
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
| `references/a2a-integration.md`         | A2A Agent 协作时        | 编排者 |
| `docs/DESIGN.md §24 专家人设体系`       | S4/S5 阶段开始时（编排者按需参考） | 编排者 |
| `docs/DESIGN.md §25 专家协作契约`       | S6 跨图验证时（仲裁/分歧时必读） | 编排者 |
| `references/expert-persona-bdd.md`      | S4 BDD 生成前（编排者加载后注入子代理） | 编排者→子代理 |
| `references/bdd-coding-guide.md`         | S4 BDD 生成时（子代理按需加载） | 子代理 |
| `references/expert-persona-tlaplus.md`  | S5 TLA+ 触发时（编排者加载后注入子代理） | 编排者→子代理 |
| `references/expert-persona-lean4.md`    | S5 Lean 4 触发时（编排者加载后注入子代理） | 编排者→子代理 |
| `references/collaboration-contract.md`  | S6 跨图验证时（仲裁/分歧时必读） | 编排者 |

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
