---
name: srs-formalizer
description: 将 SRS 文档转化为需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约和 Lean 4 证明。当用户提供或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"时使用。架构为 Agent 驱动 + 脚本门禁：TS 脚本只做门禁校验与专用算法，语义工作（解析/分析/生成/推导）全部由 LLM Agent 经 SKILL.md + prompts + references 完成。不应在以下场景触发：无 SRS 文档时、纯代码审查/调试、非技术文档（营销/法律）、用户仅需代码生成时。
compatibility: requires Node.js>=20, typescript>=5.5, Agent Skills-compatible runtime
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
  version: "2.0.0"
  pattern: agent-driven
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
    - "Bootstrap 创建工作目录结构完成"
  post_conditions:
    - "所有产物写入 .srs_formalizer/ 工作目录"
    - "verify-gate FINAL 全部通过"
    - "cross-graph-report.json 全部 13 个根本问题可回答"
    - "convergence-log.jsonl 记录迭代历史"
  permissions:
    - kind: filesystem
      scope: ".srs_formalizer/*"
      description: All workflow outputs limited to working directory
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
      strategy: "所有写入使用原子 temp-file + rename。Bootstrap 幂等保留已有文件。"
    - operation: "IR 装配 (assemble-ir)"
      strategy: "装配失败时保留上一阶段有效产物，不回退已校验数据。"
    - operation: "收敛循环 (B7 跨图验证)"
      strategy: "规模自适应迭代（≤50→3, 51-100→5, >100→8），超限触发苏格拉底拷问 + 人类决策。"
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
          enum: ["frontend", "middle-end", "backend"]
        description: "要执行的阶段（默认全部）"
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
        description: "TLA+ 形式化规约（全模块强制覆盖）"
      lean4:
        type: object
        description: "Lean 4 定理证明（security/compliance 关键词触发）"
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
      frontend,
      middle-end,
      backend,
    ]
  stage_gates:
    # Gate Validators (10)
    - validate-jsonl
    - validate-semantics
    - validate-architecture
    - validate-cypher
    - validate-bdd
    - validate-tla
    - validate-lean
    - validate-glossary
    - validate-checklist
    - verify-gate
    # Independent Tools (7)
    - assemble-ir
    - check-connectivity
    - query-graph
    - hash-compute
    - tlc-trace-parse
    - verify-skill-integrity
    - pack-skill
  capability_requirements:
    # 每个阶段对 LLM 能力的最低要求（0=跳过, 1=需人工, 2=引导式, 3=自动）
    frontend_discovery: { text_analysis: 2, reasoning: 2 }
    frontend_r1_extraction:
      { instruction_following: 3, structured_output: 3, precision: 3 }
    frontend_arch_decomposition: { hierarchical_reasoning: 3, induction: 2 }
    frontend_r2_derivation: { creative_reasoning: 3, safety_awareness: 2 }
    frontend_r3_relations: { logical_reasoning: 3, contradiction_detection: 3 }
    backend_tlaplus: { formal_tlaplus: 3, state_machine_modeling: 3 }
    backend_lean4:
      { formal_lean4: 3, theorem_proving: 3, dependent_type_understanding: 3 }
  capability_tiers:
    # 根据模型能力画像自动选择适配层级
    strong: { min_capability_score: 80, adaptation: "full_auto" }
    medium: { min_capability_score: 50, adaptation: "guided" }
    weak: { min_capability_score: 0, adaptation: "human_in_loop" }
---

# SRS Formalizer

## 概述

将 SRS 文档通过 Agent 驱动工作流转化为四类形式化产出：需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约（全模块强制覆盖）、Lean 4 证明（security/compliance 关键词触发）。TS 脚本只做门禁校验与专用算法，不调用 LLM、不产生随机性；LLM Agent 经 SKILL.md + prompts + references 完成全部语义工作（解析/分析/生成/推导/编排）。核心中间表示 `srs-ir.json v2.0.0` 连接 Frontend / Middle-end / Backend 三阶段。Agent 每阶段做语义工作 → 调用门禁/工具 → 通过后进入下一阶段。

## 何时不该使用

本技能**不应**在以下场景激活（详见 frontmatter `negative_triggers`）：

1. **无 SRS 文档时**——没有需求规格说明输入，管线无法启动
2. **纯代码审查/调试**——这不是代码审查工具，不应在 PR review 或 bug 修复场景触发
3. **非技术文档**——营销文案、法律条款、合同文本不适合形式化处理
4. **用户仅需代码生成**——如果用户只要求写代码，不需要 SRS 形式化

## 核心原则

1. **脚本只做门禁校验与专用算法**，不调用 LLM、不产生随机性、不依赖外部 API（v2.0.0 核心变更）
2. **语义工作全部由 Agent 经 SKILL.md + prompts + references 完成**——解析/提取/分析/生成/编排/子代理判决合并均不允许由脚本承担
3. **所有文件操作限定在 `.srs_formalizer/` 工作目录内**，`isPathSafe` + `assertSafePath` 双校验
4. **子代理输出必须通过 JSONL 格式校验**（`validate-jsonl` 硬门禁，6 项检查）
5. **子代理 ID 必须 ASCII-only**，正则 `^R[123]-[A-Za-z0-9_.]+-\d{4}$`，禁止中文
6. **SRS 回写必须经用户确认**；**技能工程零运行时 npm 依赖**（devDeps 仅 typescript、@types/node、gherkin-lint、gherklin）

## 渐进式披露

| 级别 | 内容 | 加载时机 |
|:----:|------|----------|
| L1 | name + description（~100 token） | 启动时加载 |
| L2 | SKILL.md 正文（本文件，≤5,000 token） | 技能激活时（编排者始终加载） |
| L3 | `prompts/orchestrator_*.md` + `prompts/executor-*.md` + `references/*.md` + `templates/` | 按需注入（阶段开始 / 子代理分派 / 子代理按需读取） |

编排者在每个阶段开始时加载对应 `orchestrator_*.md`；执行者提示词与专家人设按阶段注入子代理；references 由子代理按需加载。

## Bootstrap（替代 init 命令）

Agent 在收到 SRS 输入后，按以下指令创建工作目录（无脚本，幂等保留已有文件）：

```
.srs_formalizer/
├── srs-ir.json            # 占位，assemble-ir 产出后覆盖
├── _ctx/                  # shard_index.json (Agent 写)
├── 2_extract/             # Frontend: 需求提取 + 架构分解 JSONL
│   ├── r1-explicit/
│   ├── r2-implicit/
│   ├── r3-relational/
│   └── architecture/
├── 3_graph/               # Middle-end 分析输出
│   ├── graph/
│   └── analysis/
├── outputs/               # Backend 产物生命周期
│   ├── graphs/            # Cypher（确定性产物，无 draft/verified）
│   ├── bdd/{draft,verified,validation}/
│   ├── tlaplus/{draft,verified,validation}/
│   ├── lean4/{draft,verified,validation}/
│   ├── fixtures/
│   └── reports/
├── backups/               # 技能加密备份
└── STATE.md               # 阶段状态追踪（Agent 维护）
```

**附加动作**：复制 `templates/checklists/*.md`（S0/S1/2_extract/3_graph/4_bdd/5_formal/6_outputs）与 `templates/*.md.template`（STATE/SPECS/BEHAVIORS/CONTEXT/GAPS/MINDMAP/PROOFS/RESEARCH_LOG/S5_SKIP_REPORT）到工作目录对应位置；复制 `templates/.gherkin-lintrc-strict` 供 `validate-bdd` Phase 3 使用；写入 `STATE.md` 初始状态（标记 `bootstrap_done`）。

阶段号前缀（`2_`、`3_`）便于 `ls` 排查；Backend 使用 `outputs/` 子树承载 draft/verified 生命周期。

## Frontend 阶段（F1-F5）

| 步骤 | Agent 动作 | 调用门禁/工具 | 产出 |
|------|-----------|--------------|------|
| F1 | 读 SRS → 识别章节层级、术语、跨章引用 → 分片（MAX_SHARD_LINES=200，递归：章节→章节回退→段落回退）→ NFR 关键词扫描 → 产出 shard_index | `validate-checklist --stage S1` | `_ctx/shard_index.json` |
| F2 | 按 shard 逐个提取 R1 显式需求为 JSONL（ID `R1-<shard_id>-NNNN`） | `validate-jsonl --file <each>` | `2_extract/r1-explicit/*.jsonl` |
| F3 | 架构分解（Arch-1/2/3/4-NFR）为 JSONL | `validate-architecture --workdir` | `2_extract/architecture/*.jsonl` |
| F4 | 提取 R2 隐式 + R3 关系需求为 JSONL；术语提取为 glossary JSON | `validate-jsonl` + `validate-glossary --file` | `2_extract/{r2-implicit,r3-relational}/*.jsonl` + glossary |
| F5 | 调用工具装配 IR（去重 + 引用完整性校验，版本 `2.0.0`、buildTimestamp 非空、无悬挂边） | `assemble-ir --workdir` + `verify-gate --stage S1` + `validate-checklist` | `srs-ir.json` |

**动态架构轮次**（Agent 据 `totalShards` 决定）：<50 → 3 轮，50-99 → 4 轮，≥100 → 5 轮；`crossRefCount > 50` → +1 轮。**shard ID**：`S001`~`S999`（纯 ASCII），locator 格式 `{file_abspath}-{start}-{end}-{chunk_id}`。**Token 估算**：中文 `chars/1.5`，英文 `chars/4`。

> 🔴 **CHECKPOINT · S1 门禁收口**：F5 完成 `verify-gate --stage S1` 必须通过才可进入 Middle-end。S1 失败 → 修复 Frontend 产物后重跑，禁止跳过或降级。

## Middle-end 阶段（M1-M6）

| 步骤 | Agent 动作 | 调用门禁/工具 | 产出 |
|------|-----------|--------------|------|
| M1 | 读 IR → 判断孤儿节点、悬挂边、概念孤岛、跨文件孤岛 | `validate-semantics --strict` | `3_graph/analysis/structure.json` |
| M2 | 读 IR → Jaccard 重复检测、反义词冲突、同侧面聚类 | — | `3_graph/analysis/semantic.json` |
| M3 | 读 IR → NFR 分类（六类正式分类）+ 阈值正则提取 + 盲点检测 → 写回 IR `nfrProfile` | `validate-semantics --strict` | `srs-ir.json`（mutate nfrProfile） |
| M4 | 调用图算法工具检查跨 shard 连通性、SCC、孤岛、桥接边建议 | `check-connectivity --workdir` | `3_graph/analysis/connectivity.json` |
| M5 | 子代理冲突判决 → Agent 直接合并/标记冲突边/同侧面边 → 写回 IR `edges` | `validate-semantics --strict` | `srs-ir.json`（mutate edges） |
| M6 | 读 IR → 按风险公式计算风险评分 → 写回 `meta.riskScore` | `verify-gate --stage R3` | `srs-ir.json`（mutate meta） |

**NFR 六类正式分类**（全系统唯一）：`performance`、`security`、`availability`、`compatibility`、`maintainability`、`compliance`。SRS-IR 枚举、BDD 模板、TLA+ 不变式、Lean 定理、门禁与报告均只能使用这六项；`reliability`/`observability` 等术语仅作别名或映射信号。

**风险评分公式**：`riskScore = orphanRate×0.2 + crossFileCoverage×0.3 + nfrCoverage×0.3 + gapWeight×0.2`（详见 `references/risk-scoring-formula.md`）。

**NFR 条件触发 TLA+/Lean 4**（Agent 判断）：performance 关键词 ≥5 且 total_shards ≥100 → 强制 TLA+；security/compliance 关键词 ≥1 → 强制 Lean 4；availability 关键词 ≥3 → 生成 TLA+ 草稿（Agent 决定是否 `--promote`，须在 STATE.md 记录决策依据）。

> 🔴 **CHECKPOINT · R3 门禁收口**：M6 完成 `verify-gate --stage R3` 必须通过才可进入 Backend。R3 失败 → 修复 Middle-end 分析（结构/语义/NFR/连通性/冲突/风险）后重跑，禁止跳过。

## Backend 阶段（B1-B7）

| 步骤 | Agent 动作 | 调用门禁/工具 | 产出 |
|------|-----------|--------------|------|
| B1 | 读 IR → 生成 Cypher 知识图谱 | `validate-cypher --file` | `outputs/graphs/srs-graph.cypher` |
| B2 | 读 IR → 生成 BDD `.feature` 草稿（独立文件，NFR Feature 独立） | `validate-bdd --strict --promote` | `outputs/bdd/draft/*.feature` → `verified/` |
| B3 | 读 IR → 生成 TLA+ 草稿 + matching `.cfg`（L1→L2→L3 层次拆解，6 类 NFR 不变式） | `validate-tla --name <module> --strict --promote` | `outputs/tlaplus/draft/*.tla + *.cfg` → `verified/` |
| B4 | 读 IR（security/compliance NFR）→ 生成 Lean 4 Lake 项目草稿（拆分证明骨架，允许 sorry 仅在 draft） | `validate-lean --strict --promote` | `outputs/lean4/draft/{lakefile,**/*.lean}` → `verified/` |
| B5 | 读 IR + verified 形式化产物 → 生成测试夹具；TLC 反例经 `tlc-trace-parse` 解析为状态序列 | `tlc-trace-parse --trace` | `outputs/fixtures/**` |
| B6 | 读 IR + 所有 verified 产物 → 生成追溯矩阵 | — | `outputs/reports/traceability.{md,cypher}` |
| B7 | 读 verified 产物 + 验证报告 → 计算 hash → 组装审计包 → 跨图一致性验证（13 个根本问题 Q1-Q13） | `hash-compute` + `verify-gate --stage FINAL` | 审计目录 + `cross-graph-report.json` |

**产物生命周期状态机**：Agent 写 draft → `validate-* --strict --promote` 提升 → `verify-gate --stage FINAL` 收口。草稿目录与 verified 目录物理隔离；只有严格验证成功、报告含 `sourceHash`、工具版本、执行时间、通过结论时才可由 draft 迁入 verified。FINAL 重新计算当前 verified 输入 hash，只接受 `artifactKind`、`lifecycle: "verified"`、`passed: true` 与 `sourceHash` 均匹配的报告；过期、跨类型、畸形报告或草稿均不得消费。

**B5 TLC 反例 trace 格式**（`tlc-trace-parse --trace <path>` 输入示例）：TLC 输出以 `@!@!@STARTMSG 2110:N` / `@!@!@ENDMSG 2110` 包裹状态块，每块含 `N: <Action line...>` 行 + `/\ var = val` 变量绑定。工具解析为 `{ states: [{ index, action, variables }] }` 供 Agent 生成反例 fixture。

### 形式化建模约束

**BDD 四级门禁**（`validate-bdd --strict --promote`）：Phase1 TS 基础结构（Feature/Scenario/Given/When/Then 存在性与顺序）→ Phase2 NFR 专项（阈值数值/认证前置/LLM_FILL 残留）→ Phase3 gherkin-lint（20 条规则，配置 `templates/.gherkin-lintrc-strict`）→ Phase4 Gherklin 语义层。不允许 `error/failed/undefined/untested/占位/简化/错误实现/GAP/TODO/FIXME/TBD/待定/未定义/待实现`；每个 SRS 需求至少一个可执行场景；NFR 场景含具体阈值。独立 `.feature` 文件，不接受 Markdown 描述。

**TLA+ 全模块覆盖**（`validate-tla --name <module> --strict --promote`）：仅使用内置 `tools/tla2tools-1.7.4.jar` 执行 SANY + TLC（启用死锁检测），不联网、不下载 JAR、不创建 cfg。层次化拆解 L1→L2→L3（变量组合 >1k 考虑拆，>1w 强制拆）。每个 verified 模块必须：单一匹配文件名的模块头/尾、声明全部 CONSTANTS/VARIABLES + ASSUME、TypeOK 覆盖所有状态变量、非空 Init + 带 guard 的 Next + Spec、每个 SRS 状态转换与至少一个 Action 追溯。6 类 NFR 不变式均须在模型配置中检查。不允许死锁/状态爆炸/违法不变式/活锁/奇迹。

**Lean 4 拆分证明**（`validate-lean --strict --promote`）：在 Lake 项目根（`lakefile.lean` 或 `lakefile.toml`）审计并运行 `lake build`。0 `sorry`/`admit`/`axiom`、0 warning。每个声明为与 SRS 对应的 `theorem` + 完整 `proof`，禁止 `: True` 弱化；每个 lemma 独立文件（≤100 行），proof >50 行或 have 块 >30 行必须拆分；允许使用 Mathlib 4 标准库（优先按需导入具体子模块如 `import Mathlib.Data.*`），`validate-lean` 拒绝 `import Mathlib` 全量导入（脚本正则 `/^\s*import\s+Mathlib\s*$/m`）。对每个交付 theorem 运行 `#print axioms` 拒绝未批准公理。平台：Linux x86_64 ✅、macOS ARM64 ✅、Windows ❌。

**SRS 一致性升级流程**：形式化符合 SRS 但仍有问题时，不修改代码绕过，写入 `SRS_PATCHES.md`（矛盾描述 + SRS 引用 + 可选项 A/B/C + 事实依据，允许联网搜索），🛑 **STOP · 等待人类确认**后方可应用补丁；涉及安全关键需求时 `security_level` 提升至 `critical`。

**跨图收敛循环**（B7，规模自适应）：`total_shards ≤50` → max_iterations=3, parallelism=1；`51-100` → max=5, parallelism=2；`>100` → max=8, parallelism=4，强制 NFR 分维度并行。收敛定义 = 全部 13 个 Q 可回答 + high-confidence ≥9/13 + NFR 覆盖率 ≥80% + `verify-gate FINAL` pass。

> 🔴 **CHECKPOINT · FINAL 门禁收口**：B7 完成 `verify-gate --stage FINAL` 收口，仅接受 verified 产物且 `sourceHash` 匹配当前内容。FINAL 失败 → 回退至对应 Backend 步骤修复，禁止提交草稿或过期报告。超限未收敛 → 🛑 **STOP · 强制人类确认**是否加轮或收工。

**跨图验证 13 个根本问题（Q1-Q13）**（完整定义见 `references/convergence-loop.md`）：Q1 本质定义｜Q2 核心功能｜Q3 具体能力｜Q4 技术原理(Lean)｜Q5 集成联动｜Q6 内部行为(TLA+)｜Q7 系统间交互｜Q8 外部交互｜Q9 工作边界｜Q10 兜底方案｜Q11 性能约束｜Q12 安全边界(Lean)｜Q13 容量扩展极限。收敛 = 全部 13 问可回答 + high-confidence ≥9/13。

## 门禁/工具速查表

所有命令经 `npx tsx index.ts <command>` 调用，输出 JSON `{ status, message?, data? }`，成功 exit(0) / 失败 exit(1)。

**Gate Validators（10 个，只读校验，绝不产生语义产物）**：

| 命令 | 何时调用 |
|------|----------|
| `validate-jsonl --file <path> --workdir <wd>` | F2/F4 每个提取批次后，校验 JSONL 6 项（id 正则/category/confidence/statement/source_file/metadata） |
| `validate-semantics --workdir <wd> [--strict]` | M1/M3/M5/M6 写回 IR 后，校验类型/引用完整性/属性/阈值，`--strict` 为门禁模式 |
| `validate-architecture --workdir <wd>` | F3 架构 JSONL 6 项格式校验 |
| `validate-cypher --file <path> --workdir <wd>` | B1 生成 Cypher 后，4 项语法检查 |
| `validate-bdd --strict --promote --workdir <wd>` | B2 生成 .feature 草稿后，Phase1-4 全硬阻塞校验并提升至 verified |
| `validate-tla --name <module> --strict --promote --workdir <wd>` | B3 生成 .tla+.cfg 后，SANY+TLC 全通过并提升 |
| `validate-lean --strict --promote --workdir <wd>` | B4 生成 Lake 项目后，lake build + sorry/axiom/warning 审计并提升 |
| `validate-glossary --file <path> --workdir <wd>` | F4 术语提取后，8 项 + 门禁 |
| `validate-checklist --stage <S0-S6> --workdir <wd> [--repair]` | 各阶段转换时，检查表完整性 |
| `verify-gate --stage S1\|R3\|FINAL --workdir <wd>` | S1（Frontend 收口）/R3（Middle-end 收口）/FINAL（Backend 收口）三级门禁 |

**Independent Tools（7 个，处理 LLM 不便操作的数据结构/算法）**：

| 命令 | 何时调用 |
|------|----------|
| `assemble-ir --workdir <wd>` | F5 装配 JSONL → srs-ir.json + 引用完整性校验（去重、版本 2.0.0、buildTimestamp 非空、无悬挂边） |
| `check-connectivity --workdir <wd>` | M4 跨 shard 连通性、SCC、孤岛检测、桥接边建议（LLM 在大图上无法可靠执行） |
| `query-graph --query <type> --params '<json>' --workdir <wd>` | Middle-end/Backend 查询 IR（node/neighbors/module/modules/path/context/brainstorm），避免 LLM 直读大 JSON |
| `hash-compute --file <path> [--compare <hash>] --workdir <wd>` | validate-* 报告生成、verify-gate FINAL 比对、B7 审计包组装 |
| `tlc-trace-parse --trace <path> --workdir <wd>` | B5 TLC 反例 trace 解析为状态序列，供 Agent 生成反例 fixture |
| `verify-skill-integrity --skill-dir <path> [--repair]` | 每个阶段转换前 SHA-256 比对 MANIFEST.json，篡改则 `--repair` 从加密备份恢复 |
| `pack-skill --skill-dir <path> --force` | **仅人类显式操作**：技能开发模式修改后重建加密备份；Agent/编排者/自动化流程均无权调用 |

## 安全约束

1. **路径安全**：所有写入 `isPathSafe` + `assertSafePath` 双检查，限定 `.srs_formalizer/` 内；`validateWorkDir` 强制 `.srs_formalizer` 命名；`path.join()` 强制，禁止字符串拼接路径
2. **毒值拦截**：`undefined/null/NaN/[object Object]` 在 CLI 入口由 `validateNoPoisonArgs` 拒绝；`refuseDirectInvocation` 阻止绕过 index.ts；`safeParseArg` 错误处理 `try/catch → { status, message }` 不抛异常
3. **技能完整性**：阶段转换时必须运行 `verify-skill-integrity`；检测篡改 → 自动 `--repair` 恢复 → 输出严重警告 → 🛑 **STOP · 暂停流水线**等待人类确认；加密备份（`.enc`）不可变，仅人类 `pack-skill --force` 可重建
4. **HITL（强制 · 🛑 STOP）**：以下三类操作必须人类确认后方可继续——SRS 回写、`SRS_PATCHES.md` 应用、收敛循环超限加轮；草稿产物无法被 FINAL/交付清单/跨图验证/执行上下文消费
5. **零运行时依赖**：仅 devDeps（typescript、@types/node、gherkin-lint、gherklin）；TypeScript strict 全开；0 `any`（用 `unknown` + `instanceof Error`）；文件 ≤300 行

## 反模式与红灯（Agent 输出自检清单）

Agent 在每阶段产出后须扫描下表，命中任一项即阻断提升。详细规则见对应章节。

| 类别 | 禁止项（红灯） | 拦截机制 | 详见 |
|------|--------------|---------|------|
| BDD 产物 | `error/failed/undefined/untested/占位/简化/错误实现/GAP/TODO/FIXME/TBD/待定/未定义/待实现` | `validate-bdd` Phase1-4 拒绝 | 形式化建模约束 |
| TLA+ 产物 | 死锁/状态爆炸/违法不变式/活锁/奇迹；缺 TypeOK/Init/Next/Spec | SANY+TLC 拒绝 | 形式化建模约束 |
| Lean 产物 | `sorry/admit/axiom`/`: True` 弱化/`import Mathlib` 全量/未批准公理 | `lake build` + `#print axioms` 拒绝 | 形式化建模约束 |
| 路径安全 | 字符串拼接路径/写到 `.srs_formalizer/` 外/非 `.srs_formalizer` 命名 | `isPathSafe`+`assertSafePath` 拦截 | 安全约束 §1 |
| CLI 入口 | 绕过 `index.ts`/`undefined/null/NaN/[object Object]` 占位 | `refuseDirectInvocation`+`validateNoPoisonArgs` | 安全约束 §2 |
| 产物消费 | 草稿被 FINAL/交付清单/跨图验证消费；过期/跨类型/畸形报告 | `verify-gate FINAL` 拒绝 | 产物生命周期 |
| HITL 红灯 | 未经确认应用 SRS 回写/`SRS_PATCHES.md`/收敛超限加轮 | 🛑 STOP 流水线 | 安全约束 §4 |
| 技能完整性 | 阶段转换未跑 `verify-skill-integrity`/篡改未 `--repair` | 自动恢复 + 暂停 | 安全约束 §3 |

## 依赖技能与快速参考

**必需背景**：superpowers:test-driven-development、superpowers:verification-before-completion
**调用链**：Frontend/Middle-end 调用 superpowers:writing-plans、superpowers:executing-plans；Backend 调试调用 superpowers:systematic-debugging

**快速参考**：完整 CLI 命令参考见 `references/quick-reference.md`；Backend 流程为 Agent 生成 draft → `validate-… --strict --promote` 提升；`verify-gate --stage FINAL` 仅接受 verified 产物且 `sourceHash` 匹配。

> **Agent 注意**：所有命令必须通过 `npx tsx index.ts <command>` 调用。参数值禁止使用 `undefined`、`null`、`NaN` 等占位符。所有 17 命令清单以 `index.ts` 注册表为唯一来源。
