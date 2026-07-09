# SRS-Formalizer 设计文档

> **版本**: 0.5.6 | **日期**: 2026-07-09 | **状态**: Active
>
> 本文档是 srs-formalizer 技能开发的**唯一事实依据**（Single Source of Truth）。
> 所有设计决策、架构约束、规则合规、评估结果均记录于此。
> 代码变更必须首先更新本文档；本文档与代码不一致时，以本文档为准。

---

## 1. 概述

### 1.1 技能定义

| 属性 | 值 |
|------|-----|
| 名称 | `srs-formalizer` |
| 类型 | `framework`（基础框架型技能） |
| 主模式 | `pipeline` |
| 领域 | `formal-methods` |
| 安全等级 | `high` |
| HITL | 强制 |
| 版本 | 0.5.6（语义化版本） |

### 1.2 核心能力

将 **SRS（软件需求规格说明）** 文档转化为四类形式化产出：

| 产出 | 格式 | 阶段 | 触发条件 |
|------|------|:----:|----------|
| 需求知识图谱 | Neo4j Cypher | S3 | 必选 |
| BDD 测试骨架 | Gherkin `.feature` | S4 | 必选 |
| TLA+ 形式化规约 | `.tla` | S5 | 条件触发（并发/分布式/共识） |
| Lean 4 定理证明 | `.lean` | S5 | 条件触发（安全关键/密码学/算法） |

### 1.3 何时不该使用

- 无 SRS 文档或需求规格说明时
- 纯代码审查/调试场景
- 非技术文档（营销文案、法律条款、合同）
- 用户仅需代码生成时

---

## 2. 架构设计

### 2.1 七阶段流水线

```
S0(发现确认) → S1(预处理) → S2(需求提取) → S3(图谱构建)
             → S4(BDD生成) → S5(形式化) → S6(验收闸门)
```

| 阶段 | 输入 | 核心动作 | 产出 | 门禁 |
|:----:|------|----------|------|------|
| S0 | SRS 文档 | 扫描、触发判定、用户确认 | 分析报告 + 触发决策 | 用户确认 |
| S1 | 原始 SRS | init → manifest → glossary | shard_index.json + GLOSSARY.md | validate-glossary |
| S2 | 分片索引 | R1显式→R2隐式→R3关系 + 架构分解(3轮) | JSONL 记录 | validate-jsonl, validate-architecture |
| S3 | 需求 JSONL | 图谱构建→结构分析→语义分析→Cypher导出 | 知识图谱 + Cypher | validate-cypher, verify-gate(R3) |
| S4 | 知识图谱 | BDD 生成→gherkin-lint 严格校验→行为图谱 | .feature + behavior-graph | validate-bdd (20条规则, 零error/failed/undefined/untested/占位) |
| S5 | 图谱 + 触发 | TLA+ 层次化建模（L1→L2→L3, 可推广 N 级）/ Lean 4 拆分证明（四步循环, 递归至 0 sorry） | .tla / .lean + 交互图谱 | validate-tla (SANY+TLC, 零死锁/状态爆炸/占位), validate-lean (lake build, 零sorry/axiom/warning) |
| S6 | 全阶段产物 | 系统架构合成→跨图一致性验证→收敛循环 | 架构图谱 + 一致性报告 | verify-gate(FINAL) |

### 2.2 设计模式（嵌套组合）

```
主模式: pipeline
├── Inversion  @S0   — 信息不全不进 S1，强制 interview 模式
├── Generator  @S2-5 — 零自由度填空模板，禁止增减字段
├── Reviewer   @门禁 — 可执行 checklist，全部打勾才 APPROVED
└── Tool Wrapper @全局 — L3 渐进加载，按需注入 reference
```

### 2.3 渐进式披露（Progressive Disclosure）

| 级别 | 内容 | Token | 加载时机 |
|:----:|------|-------|----------|
| L1 | name + description | ~100 | 启动时加载 |
| L2 | SKILL.md 正文 | ≤5,000 | 技能激活时 |
| L3 | references/ + templates/ + prompts/ | 按需 | 指令明确要求时 |

当前 L2: ~3,800 tokens（合规），L3: 17 references + 18 templates + 28 prompts。

### 2.4 目录结构

```
.claude/skills/srs-formalizer/
├── SKILL.md                 # L1+L2：前置元数据 + 正文指令
├── CHANGELOG.md             # 版本变更历史
├── BASELINE.md              # TDD RED 阶段基线跟踪器
├── agent-card.json          # A2A Protocol v1.0 Agent Card
├── MANIFEST.json            # 完整性校验清单
├── srs-formalizer-backup.enc # AES-256-GCM 加密备份
│
├── scripts/                 # TypeScript 工具链（零运行时 npm 依赖）
│   ├── index.ts             # CLI 入口（注册表模式，31 条命令）
│   ├── commands/            # 31 条命令（每文件 ≤300 行）
│   ├── lib/                 # 共享库模块
│   │   ├── cli.ts           # CLI 参数安全解析
│   │   ├── security.ts      # 路径安全校验（与 cli.ts 功能重复，保留用于 validate-jsonl/validate-architecture 的独立导入）
│   │   ├── graph.ts         # 图数据结构
│   │   ├── jsonl.ts         # JSONL 读写与校验
│   │   ├── traversal.ts     # 图遍历算法
│   │   ├── anti-skill.ts    # Anti-Skill 安全约束注入
│   │   ├── skir-builder.ts  # SkIR 构建器
│   │   ├── compile-validator.ts # 编译时 Schema 校验
│   │   ├── emitter-claude-xml.ts # Claude XML 发射器
│   │   ├── emitter-generic-md.ts # 通用 Markdown 发射器
│   │   ├── checklists.ts    # 阶段验收 CHECKLIST
│   │   ├── tla-validator.ts # TLA+ SANY+TLC 验证
│   │   ├── bdd.ts           # Gherkin 生成与校验
│   │   ├── cypher.ts        # Cypher 查询生成
│   │   ├── cross-graph-verifier.ts # 跨图一致性验证
│   │   ├── system-architecture.ts  # 系统架构合成
│   │   ├── behavior-graph.ts       # 行为图谱
│   │   ├── lean-graph.ts           # Lean 4 证明图谱
│   │   ├── tla-graph.ts            # TLA+ 交互图谱
│   │   ├── llm/              # LLM 稳定性测试
│   │   │   ├── config.ts     # Provider 配置
│   │   │   └── stability.ts  # 稳定性测试引擎
│   │   ├── probe/            # 能力探测系统
│   │   │   ├── types.ts      # 共享类型（8 维度）
│   │   │   ├── questions.ts  # 50 探针聚合
│   │   │   ├── scorer.ts     # 评分 + 画像计算
│   │   │   ├── questions/    # 8 个维度探针生成器
│   │   │   └── scorer/       # 8 个维度评分器 + helpers
│   │   ├── cross-graph/      # 跨图验证问题定义
│   │   ├── verify-gate/      # 三级门禁检查
│   │   └── architecture/     # 架构图构建
│   ├── types/                # 共享 TypeScript 类型
│   │   ├── index.ts          # JsonlRecord, CliResult, ShardIndex
│   │   └── skir.ts           # SkIR 强类型（20+ 字段）
│   ├── __tests__/            # 38 文件，320 测试
│   └── templates/            # 脚本模板
│       └── check.sh.template # CHECKLIST 检查脚本模板
│
├── prompts/                  # LLM 提示词（28 文件）
│   ├── orchestrator_stage_S0~S6.md  # 7 编排者指令
│   ├── executor-R1~R5.md           # 6 执行者模板（R4 拆分为 clarify+verify）
│   ├── executor-bdd.md             # BDD 行为建模执行者（S4 专用）
│   ├── executor-tlaplus.md         # TLA+ 并发系统建模执行者（S5 专用）
│   ├── executor-lean4.md           # Lean 4 定理证明执行者（S5 专用）
│   ├── executor-arch-1~3.md        # 3 架构分解模板
│   ├── executor-glossary.md        # 术语提取模板
│   ├── verifier-R1~R5.md           # 5 校验者清单
│   ├── verifier-arch.md            # 架构审核清单
│   └── debug-lean.md, debug-tlc.md # 2 诊断指南
│
├── references/               # L3 参考资料（17 文件）
│   ├── quick-reference.md    # 完整 CLI 命令表
│   ├── strict-modes.md       # S4/S5/S6 严格模式详情
│   ├── stability-baseline.md # 跨 LLM 稳定性基线
│   ├── a2a-integration.md    # A2A 协议集成指南
│   ├── capability-adaptation.md    # 能力分级适配方案
│   ├── srs-chapter-guide.md        # SRS 章节识别规范
│   ├── tlaplus-coding-guide.md     # TLA+ 编码指南
│   ├── lean4-coding-guide.md       # Lean 4 编码指南
│   ├── gherkin-lint-guide.md       # Gherkin Lint 参考
│   ├── hooks-integration.md        # 多平台激活适配
│   ├── auto-setup.md               # 编码智能体自配置
│   ├── agent-integration-guide.md  # 多平台集成差异
│   ├── expert-persona-bdd.md       # BDD 行为建模专家人设
│   ├── expert-persona-tlaplus.md   # TLA+ 并发系统建模专家人设
│   ├── expert-persona-lean4.md     # Lean 4 定理证明专家人设
│   ├── collaboration-contract.md   # 专家协作契约
│   └── bdd-coding-guide.md         # BDD 编码参考指南
│
├── templates/                # 产出模板（18 文件）
│   ├── STATE.md.template     # 状态追踪
│   ├── CONTEXT.md.template   # 术语表与切片索引
│   ├── GAPS.md.template      # 信息缺口追踪
│   ├── MINDMAP.md.template   # SRS 结构总览
│   ├── BEHAVIORS.md.template # BDD 分层建模索引
│   ├── SPECS.md.template     # TLA+ 规约索引
│   ├── PROOFS.md.template    # Lean 4 证明索引
│   ├── RESEARCH_LOG.md.template # 深度研究日志
│   ├── S5_SKIP_REPORT.md.template # S5 跳过报告
│   ├── .gherkin-lintrc       # BDD 校验配置
│   ├── .gherkin-lintrc-strict # 严格模式（20 条规则）
│   └── checklists/           # 7 份阶段验收 CHECKLIST
│
├── tests/                    # 验收用例（11 文件）
│   ├── golden/               # L4 验收 Golden 标准
│   ├── fixtures/             # 测试夹具
│   └── assertions/           # 集成测试断言
│
├── examples/                 # 使用示例
│
└── tools/                    # 内置工具
    └── tla2tools-1.7.4.jar   # TLA+ SANY + TLC
```

### 2.5 提示词类型与角色

技能使用四种提示词类型，分别对应不同的代理角色：

| 类型 | 数量 | 角色 | 调用方式 | 约束 |
|------|:----:|------|----------|------|
| **编排者** (Orchestrator) | 7 | 阶段级决策者：执行 CLI 命令、分派子代理、管理阶段转换 | 由编排者按阶段自动加载 | 技能完整性校验先于每阶段转换 |
| **执行者** (Executor) | 10→13 | 零自由度模板填充者：接收结构化输入，产生结构化 JSONL 输出 | 编排者通过 `inject-prompt` 注入 | 禁止增减字段、编造数据 |
| **执行者-领域** (Executor-Domain) | 3 | BDD/TLA+/Lean 4 领域专家执行者：注入完整专家人设，专注单一形式化领域 | S4/S5 编排者通过 `inject-prompt` 注入 | executor-bdd / executor-tlaplus / executor-lean4 |
| **验证者** (Verifier) | 6 | 独立审查者：在新会话中按 checklist 逐项核验执行者输出 | 编排者在阶段 gate 时调用 | 强制新会话、禁止信任执行者报告 |
| **调试** (Debug) | 2 | 被动诊断工具：仅在 TLA+/Lean 构建失败时触发，提供错误分类和修复建议 | S5 编排者按需调用 | 不修改源代码，仅输出诊断报告 |

提示词文件与设计模式的对应：
- Inversion (S0) → 编排者 S0（强制 interview，信息不全不进 S1）
- Generator (S2-5) → 执行者模板（零自由度填空）
- Reviewer (门禁) → 验证者 checklist（全部打勾才 APPROVED）
- Tool Wrapper (全局) → L3 渐进加载（编排者按需注入 reference）

注意：执行者 R4 拆分为两个独立文件：`executor-R4-clarify.md`（信号澄清）和 `executor-R4-verify.md`（矛盾检测），分别承担不同的子代理角色。

**专家人设补充**：上述四种提示词类型定义了流程角色（如何执行）。此外，技能定义了三个领域专家人设——BDD 行为建模专家、TLA+ 并发系统建模专家、Lean 4 定理证明专家——作为 L3 参考资料内置在 `references/expert-persona-*.md` 中。编排者在对应阶段开始时加载（S4→BDD 人设, S5→TLA+/Lean 4 人设），作为子代理分派和质量判定的上下文。详见 [§24 专家人设体系](#24-专家人设体系)。

---

## 3. 设计决策

### 3.1 核心约束

| # | 决策 | 原因 |
|:--:|------|------|
| 1 | **零运行时 npm 依赖** | 技能工程哲学：技能应自包含，不引入供应链风险。仅 `typescript` + `@types/node` 为 devDeps |
| 2 | **TypeScript strict 全家桶** | `strict: true`（`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`） |
| 3 | **TS 脚本只做确定性转换** | 不调用 LLM、不产生随机数、不依赖外部 API |
| 4 | **所有文件操作限定工作目录** | `.srs_formalizer/` 内，路径安全双校验（`isPathSafe` + `assertSafePath`） |
| 5 | **所有 CLI 命令必须经 index.ts** | `refuseDirectInvocation` 阻止直接调用，防止 LLM 绕过参数校验 |
| 6 | **统一错误处理模式** | 所有命令使用 `try { safeParseArg() } catch { return { status: 'error', message } }` 模式。错误通过 CliResult 返回而非抛出异常 |
| 7 | **毒值拒绝** | `undefined`/`null`/`NaN`/`[object Object]` 在入口 `validateNoPoisonArgs` 拦截 |
| 8 | **文件大小硬限制** | 单文件 ≤300 行（0.5.7 全部达标，最大 283 行） |
| 9 | **禁止 `any` 类型** | 严格 TypeScript 模式，所有错误类型使用 `unknown` + `instanceof Error` |
| 10 | **路径拼接强制 `path.join()`** | 禁止字符串拼接，禁止硬编码系统命令 |
| 11 | **`init` 用 `--output`，其余用 `--workdir`** | 统一接口规范，`validateWorkDir` 强制 `.srs_formalizer` 命名 |

### 3.2 安全设计

| 层级 | 机制 | 说明 |
|:----:|------|------|
| 编译期 | Anti-Skill Injector | 7 条安全规则注入（4 SkCC 通用 + 3 SRS 特有），94.8% 触发率 |
| 编译期 | Fail-Fast 10 条 | 字段缺失/XML标签/模式不匹配/权限不对齐 → 编译失败 |
| 运行时 | 路径安全 | `isPathSafe` + `assertSafePath` 双重校验，防目录遍历 |
| 运行时 | 参数安全 | `validateNoPoisonArgs` 拦截 LLM 生成的垃圾参数 |
| 运行时 | 技能完整性 | `verify-skill-integrity` SHA-256 哈希校验 + `.enc` 加密备份 |
| 运行时 | 门禁条件 | 9 个 stage_gates 硬性校验，不通过阻断后续阶段 |
| 流程 | HITL | `security_level: high` → 强制人工审批 |
| 流程 | Toxic Flow Defense | 三要素中 `accesses_private_data: false`（阻断 toxic 链） |

### 3.3 为什么选 Pipeline 主模式

srs-formalizer 是典型的**多步顺序执行**场景，每步产物依赖上一步、每步有明确 gate condition：

- S0 确认输入 → gate: 用户确认
- S1 预处理 → gate: validate-glossary
- S2 需求提取 → gate: validate-jsonl + validate-architecture
- S3 图谱构建 → gate: validate-cypher + verify-gate(R3)
- S4 BDD 生成 → gate: validate-bdd
- S5 形式化 → gate: validate-tla + validate-lean
- S6 验收 → gate: verify-gate(FINAL)

其他模式的嵌入是补充性的：Inversion 确保 S0 不猜测用户意图；Generator 确保子代理输出结构化；Reviewer 确保每步独立校验；Tool Wrapper 控制 token 预算。

### 3.4 为什么 S5 条件触发

TLA+ 和 Lean 4 形式化对 SRS 内容有特定要求：

- **TLA+ 适用**: 并发系统、分布式锁、共识协议、状态机 → 高价值
- **TLA+ 不适用**: 单线程 CRUD 系统 → 产出的 TLA+ 规约无实际意义
- **Lean 4 适用**: 安全关键算法、密码学、自定义数据结构正确性 → 高价值
- **Lean 4 不适用**: 常规业务逻辑 → 证明开销远大于收益

不适用时通过快速退出路径（S0 Step 3.5 + S5 快速退出检查）跳过，避免浪费 token。

---

## 4. 规则合规

### 4.1 合规矩阵

| 规则文件 | 要求数 | 合规 | 备注 |
|----------|:------:|:----:|------|
| `rules/skill/structure.md` | 10 Fail-Fast | 10/10 | L2 ≤5,000 ✓, 格式中立 ✓ |
| `rules/skill/security.md` | 10 Fail-Fast | 10/10 | HITL ✓, fallbacks ✓, permissions ✓ |
| `rules/skill/verification.md` | 22 自检项 | 22/22 | TS only ✓, path.join() ✓ |
| `rules/skill/cross-platform.md` | 7 适配项 | 6/7 | MCP 结构支持但未运行时配置 |
| `rules/project/coding/standards.md` | 6 规范 | 6/6 | strict TS ✓, 文件大小 ✓, 无 any ✓ |
| `rules/project/coding/testing.md` | 5 测试层 | 5/5 | 320 tests, 0 fail |
| `rules/project/rules.md` | 4 规范 | 4/4 | Conventional Commits ✓ |

### 4.2 已知差距

| 项 | 优先级 | 说明 |
|:--:|:------:|------|
| 跨 LLM 稳定性数据 | P0 | 已建测试基础设施（`stability-test` 命令），待收集数据 |
| MCP 服务器运行时 | P3 | SkIR 类型支持，编译管线支持，但未部署实际 MCP server |
| Windows 端到端测试 | P4 | TLA+ 可运行（Java），Lean 4 禁止（需 WSL2） |
| 能力探测 TLA+ 评分器 Java 类名 | ~~P1~~ ✅ | 评分器误用 `tla2.SANY`/`tla2.TLC`（ClassNotFoundException），已修正为 `tla2sany.SANY`/`tlc2.TLC`。经 `java -cp tla2tools-1.7.4.jar` 实测：SANY Version 2.2 (2020-07-08), TLC2 Version 2026.05.18 |

### 4.3 BDD 建模约束

#### 4.3.1 格式要求

- **必须采用独立 `.feature` 文件格式建模**，不接受 Markdown 模式描述 BDD
- 必须有完整步骤（Given → When → Then → And），必须完整定义状态和状态转换
- 每个 Then 含 `# verification_method:` 标注
- 每个 .feature 文件独立（对应 SRS 各模块）

#### 4.3.2 生成-校验-阻塞流程

S4 阶段执行 BDD 生成后立即触发 gherkin-lint 严格模式校验。若校验失败（如存在 `THEN_PLACEHOLDER`），则会形成硬阻塞：

1. `generate-bdd` → 生成 `.feature` 文件
2. `validate-bdd` → gherkin-lint 严格模式（20 条规则，配置 `templates/.gherkin-lintrc-strict`）
3. 若 `THEN_PLACEHOLDER` 或 `error`/`failed`/`undefined`/`untested` 或步骤缺失存在 → `build-behavior-graph` 拒绝执行
4. 阻塞解除条件：所有 Gherkin 文件通过全部 20 条规则

此设计确保行为图谱仅有完整的场景定义，防止占位符流入下游分析。

#### 4.3.3 质量门禁

| # | 检查 | 严重度 |
|:--:|------|:------:|
| 1 | 无 GAP / TODO / FIXME / TBD / 待定 / 未定义 / 待实现 | 硬阻塞 |
| 2 | 无 `<THEN_PLACEHOLDER>` / `<GIVEN_PLACEHOLDER>` 等占位符 | 硬阻塞 |
| 3 | 无 `error` / `failed` / `undefined` / `untested` | 硬阻塞 |
| 4 | 步骤完整（无缺失 Given/When/Then） | 硬阻塞 |
| 5 | Scenario Outline 变量全部使用 | 硬阻塞 |
| 6 | 逻辑顺序 Given → When → Then → And | 硬阻塞 |
| 7 | 不允许占位实现、简化实现、错误实现 | 硬阻塞 |
| 8 | `build-behavior-graph` 成功构建（含 Feature/Scenario/Action 节点） | 硬阻塞 |

#### 4.3.4 SRS 一致性处理

建模必须符合 SRS 设计并进一步细化。出现问题先检查建模与设计一致性；一致但仍有问题则与用户交互修正设计。

> **专家人设**: BDD 行为建模专家的完整身份定位、核心方法论、质量门禁与上报路径详见 [§24.1 BDD 行为建模专家](#241-bdd-行为建模专家)。

### 4.4 TLA+ 建模约束

#### 4.4.1 层次化拆解方法

TLA+ 建模采用层次化递进策略：

```
L1: 系统内外交互抽象
  └─ L2: 子系统内部行为 + 上下同级交互抽象
      └─ L3: 原子化子系统行为抽象
          └─ L4/L5/L6... (可推广，每个下级子系统视为独立系统继续拆解)
```

**拆解判定方法：**
1. 先写 TLA+ 规约
2. 分析变量组合状态空间
3. 组合结果 >1k 时考虑拆解，>1w 时必须拆解
4. 每个下级子系统视为独立系统递归应用此方法

#### 4.4.2 调试与验证流程

```
1. 删除旧的轨迹文件（.stl）和状态文件（.tlc）
2. 先通过 SANY 语法检查
3. SANY 通过后才允许执行 TLC 模型检查
4. TLC 失败 → debug-tlc 子代理定位根因 → 修正后回到步骤 1
5. 全部通过 → 冻结 .tla 文件 → 构建交互图谱
```

#### 4.4.3 质量门禁

| # | 检查 | 命令/方法 | 严重度 |
|:--:|------|------|:------:|
| 1 | SANY 语法检查 | `validate-tla` | 硬阻塞 |
| 2 | TLC 模型检查（-deadlock） | `validate-tla` | 硬阻塞 |
| 3 | 无死锁（黑洞） | `-deadlock` 标志 | 硬阻塞 |
| 4 | 无状态爆炸 | TLC 状态空间限制 | 硬阻塞 |
| 5 | 无违法不变式 | TypeOK 不变式 | 硬阻塞 |
| 6 | 无活锁（停滞） | Stuttering 检测 | 硬阻塞 |
| 7 | 无奇迹（不可能的状态转换） | TLC 覆盖检查 | 硬阻塞 |
| 8 | 无占位实现、简化实现、错误实现 | 人工 + 自动化审查 | 硬阻塞 |

正常系统不允许死锁。死锁或矛盾分支需定位根因修正。

> **源重扫（门禁 #8「自动化审查」落地）**: verify-gate FINAL 的 `checkTlaGraphExists` 与构建期 `build-tla-graph` 会重新读取 `5_formal/specs/*.tla`，**仅在注释区域**匹配禁止占位标记 `GAP / TODO / FIXME / TBD / 待定 / 未定义 / 待实现`，命中即 fail——不再仅凭 `tla-interaction-graph.json` 存在放行。这落地了门禁 #8 中可确定性检测的那一半；语义型简化（弱不变式、缩小状态空间、伪代码代替 .tla）无单一文本特征，仍由 SANY/TLC 与人工审查负责。与 Lean 侧 §4.5.2 源重扫机制对称（Lean 去注释匹配 `sorry`/`axiom`，TLA+ 保留注释匹配标记）。

#### 4.4.4 工具链条件

- 工具：内置 `tla2tools-1.7.4.jar`（SANY 2.2 + TLC2 2026.05.18），仅需 Java 11+
- 三层回退：GitHub API → 本地缓存 → 内置兜底
- 能力探测探针仅在有工具链时生成 TLA+ 维度
- 无工具链时评分器降级为语法检查（7 项正则检查，满分 100）

> **专家人设**: TLA+ 并发系统建模专家的完整身份定位、层次化拆解方法论、验证顺序与根因分析详见 [§24.2 TLA+ 并发系统建模专家](#242-tla-并发系统建模专家)。

### 4.5 Lean 4 建模约束

#### 4.5.1 拆分证明方法（强制四步循环）

```
Step 1: 编写证明骨架（带 sorry）
   └─ LLM 子代理编写 theorem 声明和证明策略框架
Step 2: 将每个 sorry 变为独立文件证明
   └─ 每个 lemma 独立文件（≤100 行）
Step 3: 无法单文件则继续拆分
   └─ 拆分为多个文件分别证明，然后 import
Step 4: 递归循环
   └─ 若仍有 sorry → 回到 Step 1，递归至 0 个 sorry
```

#### 4.5.2 硬门禁

| # | 检查 | 命令 | 严重度 |
|:--:|------|------|:------:|
| 1 | 0 `sorry` | `grep -r "sorry" *.lean` → 空 | 硬阻塞 |
| 2 | 0 `axiom` | `grep -r "axiom" *.lean` → 空 | 硬阻塞 |
| 3 | 0 warnings | lake build 输出无 warning | 硬阻塞 |
| 4 | lake build 通过 | exit 0 | 硬阻塞 |
| 5 | theorem + 完整 proof | 每个声明含完整 tactic proof | 硬阻塞 |
| 6 | 每个 lemma 独立文件 | 无 >100 行单体证明 | 硬阻塞 |
| 7 | 无占位实现、简化实现、错误实现 | 人工 + 自动化审查 | 硬阻塞 |

**附加约束：**
- ✅ 允许使用 mathlib4（最新版），首次执行 `lake exe cache get`
- ✅ 策略级联：`rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop`
- ❌ 禁止 `#eval` 替代 proof
- ❌ 禁止 `import Mathlib`（全量导入）
- ❌ 每个修改后立即 `lake build`，不积攒

**verify-gate FINAL 二级扫描防护：** 在上述硬门禁之外，verify-gate FINAL 阶段在验证 `lean-proof-graph.json` 存在性的基础上，额外对 `5_formal/proofs/*.lean` 源文件执行注释感知重扫描（剥离注释后按词边界匹配 `sorry`/`axiom`），作为第二道防线。任何命中均直接判定为门禁失败，不再仅依赖图谱文件的存在性判断。此机制中 `axiom` 与 `sorry` 同为硬阻塞（`axiom` 从原 warn 提升为 fail），与上表第 2 行一致。

#### 4.5.3 平台限制

| 平台 | 支持 |
|------|:----:|
| Linux x86_64 | ✅ |
| macOS ARM64 | ✅ |
| Windows | ❌ 禁止（引导使用 WSL2） |

#### 4.5.4 工具链条件

- 需要 `lake` 命令可用
- 能力探测探针仅在有工具链时生成 Lean 4 维度
- 无工具链时评分器降级为语法检查（7 项检查，含 lake build 时 +40 分）

> **专家人设**: Lean 4 定理证明专家的完整身份定位、迭代式拆分证明法、质量门禁与关键上报节点详见 [§24.3 Lean 4 定理证明专家](#243-lean-4-定理证明专家)。

### 4.6 SRS 一致性升级流程（TLA+ / Lean 4 共享）

当 TLA+ 或 Lean 4 建模符合 SRS 设计但仍有问题（死锁、违反不变式、状态爆炸、不可证明、类型不匹配）时：

1. **不修改代码绕过问题**
2. 写入 `SRS_PATCHES.md`，格式：
   ```
   ## SRS 不一致报告
   - 矛盾: <描述>
   - SRS 引用: <章节>
   - 可选项:
     A. <方案A> — 推荐 ✓
     B. <方案B>
     C. <方案C>
   - 事实依据: <联网搜索的论文/开源 URL>
   ```
3. **允许联网搜索深度调研**，基于事实工作（不允许编造论文或 URL）
4. 等待人类确认后按确认方案修改
5. 若不一致涉及安全关键需求，`security_level` 临时提升至 `critical`

---

## 5. 评估结果

### 5.1 SKILL-RUBRIC v0.1.5

| 维度 | 得分 | 策略 | 关键证据 |
|------|:----:|:----:|----------|
| D1 Problem-fit | 8/10 | Lenient | 明确用户画像 + 反事实价值 + 320 测试 |
| D2 Architecture | 8/10 | Strict | 单一职责 + 渐进式披露 + 工具面最小化 |
| D3 Reliability | 5/10 | Strict | D3.1 硬上限（缺跨 LLM 数据），安全设计良好 |
| D4 Output-fit | 8/10 | Strict | 溯源 + 零往返 + 失败清晰 |
| D5 Lifecycle-fit | 7/10 | Strict | 版本管理 + 阶段契约 + 生态集成 |

**加权平均**: 7.2/10 → **B+**（Good）

### 5.2 OWASP AST10

通过率 **9/10**：

| # | 风险 | 状态 |
|:--:|------|:----:|
| AST01 | Malicious Skills | ✅ SHA-256 + .enc 防篡改 |
| AST02 | Supply Chain | ✅ verify-skill-integrity |
| AST03 | Over-Privileged | ✅ 最小权限 scope |
| AST04 | Insecure Metadata | ✅ 无 XML 标签 + YAML 自定义解析 |
| AST05 | Untrusted Instructions | ✅ 输入限定 SRS 文档 |
| AST06 | Weak Isolation | ⚠️ 无容器隔离，但路径安全校验 |
| AST07 | Update Drift | ✅ SHA-256 + semver |
| AST08 | Poor Scanning | ✅ 四阶段编译管线 + Anti-Skill |
| AST09 | No Governance | ✅ verify-gate + HITL |
| AST10 | Cross-Platform | ✅ A2A Agent Card（agent-card.json） |

### 5.3 SkillAudit

安全风险等级: **Low**（0 高危发现）

---

## 6. 技术栈

| 组件 | 选型 | 版本 |
|------|------|------|
| 语言 | TypeScript (strict) | ≥5.5 |
| 运行时 | Node.js (ESM) | ≥20 |
| 执行器 | tsx | latest |
| 测试 | Node.js native `node:test` | built-in |
| 格式化 | Prettier | latest |
| 形式化 | tla2tools (built-in JAR) | 1.7.4 |
| 形式化 | Lean 4 + mathlib4 | latest |
| BDD 校验 | gherkin-lint | latest |
| 编译目标 | SkIR → Claude XML + Generic MD | — |

### 6.1 依赖策略

```
运行时依赖: 0（零外部 npm 包）
开发依赖: typescript, @types/node
内置工具: tla2tools-1.7.4.jar (27MB)
```

### 6.1.1 CHECKLIST 修复机制

`checklists.ts` 模块提供 `repairChecklist` 函数，用于自动修复 CHECKLIST 格式问题：

- 自动补充缺失的阶段标题
- 标准化 Checklist 条目格式
- 移除重复条目

CLI 命令 `validate-checklist --repair` 调用此函数，在 S1/S3/S6 门禁前自动修复格式问题，减少人工干预。

---

## 7. 测试策略

### 7.1 测试层级

| 层级 | 覆盖 | 数量 | 通过标准 |
|------|------|:----:|----------|
| 单元测试 | 函数/方法级 | 320 | 100% 分支覆盖 |
| 模块测试 | 组件/工具类 | 内嵌于单元测试 | 所有公开接口 |
| 集成测试 | 多模块协作 | `tests/assertions/` | 端到端正确 |
| Golden 测试 | 基准比对 | `tests/golden/` | 输出与基准一致 |

### 7.2 运行命令

```bash
cd .claude/skills/srs-formalizer/scripts
npm install                       # 安装 devDeps
npx tsc --noEmit                  # Typecheck（strict, 0 errors）
npx tsx --test __tests__/*.test.ts # 320 tests
```

---

## 8. CLI 参数约定

所有 CLI 命令遵循以下参数约定：

| 参数 | 适用命令 | 说明 |
|------|----------|------|
| `--output` | init | 工作目录路径（仅 init） |
| `--workdir` | 大部分流水线命令（init 除外） | 工作目录路径，必须为 `.srs_formalizer`。例外：validate-lean 不使用 --workdir，改为从 --file 路径向上查找 lakefile 自动发现项目目录 |
| `--file <path>` | validate-* | 待校验文件路径 |
| `--skill-dir <path>` | compile, pack-skill, verify-skill-integrity | 技能目录路径 |
| `--mode generate\|score` | capability-probe | 两阶段模式 |
| `--stage S1\|R3\|FINAL` | verify-gate | 门禁检查阶段 |
| `--repair` | validate-checklist, verify-skill-integrity | 自动修复模式 |
| `--force` | pack-skill | 强制覆盖已有备份 |
| `--src <path>`, `--lang zh\|en` | manifest | 源文件路径和语言 |
| `--shard-id`, `--type`, `--line` | guided-extract | 引导提取参数 |
| `--query <type>`, `--params '<json>'` | query-graph | 图谱查询参数 |
| `--iteration N` | build-system-architecture | 收敛循环迭代次数 |
| `--config <path>`, `--passes <N>`, `--score <dir>`, `--output <dir>` | stability-test | 稳定性测试参数 |
| `--min-high N` | validate-glossary | 最小高置信度阈值 |

### 8.1 CLI 输出格式约定
所有命令将结果以 JSON 格式输出到 stdout：
`{ "status": "ok" | "error", "message"?: string, "data"?: ... }`
成功时 `process.exit(0)`，失败时 `process.exit(1)`。

### 8.2 refuseDirectInvocation 放置约定
所有命令文件的最后两行为：
```typescript
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
```
此约定确保每个命令文件无法被直接调用（`npx tsx commands/foo.ts`），必须通过 `index.ts` 入口。

---

## 9. CLI 命令清单（31 条）

| 命令 | 阶段 | 功能 |
|------|:----:|------|
| `init` | S1 | 初始化 `.srs_formalizer/` 工作目录 |
| `manifest` | S1 | SRS 索引化分片 + 章节识别 + 缺口检测 |
| `inject-prompt` | S2 | 模板参数注入 |
| `guided-extract` | S2 | 两步模式逐行 JSONL 提取 |
| `validate-jsonl` | S2 | JSONL 格式校验（6 项） |
| `validate-architecture` | S2 | 架构 JSONL 校验（6 项 + 循环检测） |
| `validate-glossary` | S1 | 术语表批次 JSON 校验（8 项） |
| `build-graph` | S3 | JSONL → 需求知识图谱 |
| `build-architecture` | S3 | 架构 JSONL → 架构图节点 |
| `analyze-structure` | S3 | 孤立/悬挂/孤岛检测 |
| `merge-structure` | S3 | 结构补全合并 |
| `analyze-graph` | S3 | Jaccard 去重 + 反义检测 |
| `merge-analysis` | S3 | 语义判定合并 |
| `export-cypher` | S3 | 图谱 → Neo4j Cypher 脚本 |
| `validate-cypher` | S3 | Cypher 脚本校验（4 项） |
| `generate-bdd` | S4 | 图谱 → Gherkin BDD 骨架 |
| `validate-bdd` | S4 | Gherkin 严格模式校验（20 条规则） |
| `build-behavior-graph` | S4 | BDD → 系统行为图谱 |
| `build-tla-graph` | S5 | TLA+ → 系统交互图谱 |
| `build-lean-graph` | S5 | Lean 4 → 证明依赖图谱 |
| `validate-tla` | S5 | SANY + TLC 模型检测（严格模式） |
| `validate-lean` | S5 | lake build 编译验证 |
| `build-system-architecture` | S6 | 系统架构合成 + 一致性报告 |
| `query-graph` | S6 | 图谱只读查询（7 种） |
| `verify-gate` | S1/S3/S6 | 三级硬门禁检查 |
| `validate-checklist` | S0-S6 | CHECKLIST 完成度校验 |
| `capability-probe` | S0 | LLM 能力探测（8 维度 50 题） |
| `stability-test` | 评估 | 跨 LLM 稳定性测试（σ/Δ） |
| `compile` | 编译 | SKILL.md → SkIR + 安全注入 + 平台发射 |
| `pack-skill` | 维护 | 技能打包 + 加密备份 |
| `verify-skill-integrity` | 维护 | 技能完整性校验 + 自动修复 |

---

## 10. 演化历史

| 版本 | 日期 | 关键变更 |
|------|------|----------|
| 0.1.0 | 2026-06-30 | S1 基础设施：init, manifest, 类型定义, 安全库, 25 测试 |
| 0.2.0 | 2026-06-30 | S2 阶段：inject-prompt, validate-jsonl, executor/verifier 提示词 |
| 0.3.0 | 2026-06-30 | 目录重构（阶段前缀），ID ASCII-only 约束，分片源位置标注 |
| 0.4.0 | 2026-07-01 | SkCC 集成：compile, SkIR, Anti-Skill, Claude XML/Generic MD 发射器 |
| 0.5.0 | 2026-07-01 | 分片索引化重构，移除物理 `1_shard/` 目录 |
| 0.5.1 | 2026-07-02 | TLA+/Lean 编码指南，capability-probe 50 题扩展 |
| 0.5.2 | 2026-07-02 | guided-extract `--line` 模式，严格模式增强 |
| 0.5.2+ | 2026-07-03 | 规则合规审计（文件拆分, any→unknown, L2 token 缩减），评估后改进（P0-P3） |
| 0.5.3 | 2026-07-03 | **能力探测修复**：工具链条件生成（14.5）+ TLA+/Lean 4 语法降级评分（14.6）。**路径 Bug 修复**：`validate-lean.ts` 手动字符串切割→`path.dirname/join`（Windows 兼容）；`validate-tla.ts` `__dirname`→`fileURLToPath`（ESM 兼容）；`scorer/tlaplus.ts` `findJar()` 分辨率至 `../../tools/` + 类名修正（`tla2.SANY`→`tla2sany.SANY`, `tla2.TLC`→`tlc2.TLC`，经 JAR 实测验证：SANY 2.2, TLC2 2026.05.18） |
| 0.5.5 | 2026-07-07 | **专家人设体系**：新增三位形式化专家人设（BDD §24.1、TLA+ §24.2、Lean 4 §24.3）+ 专家协作契约 §25（协作工作流、冲突仲裁、统一交付标准、上报机制） |
| 0.5.6 | 2026-07-09 | **verify-gate 源重扫安全修复**（§4.4.3 / §4.5.2）：FINAL 门禁与构建期不再仅凭图谱 JSON 存在放行，改为重扫源文件。Lean（B3）去注释后按词边界匹配 `sorry`/`axiom`（`axiom` 由 warn 升为 fail）；TLA+（B3-TLA+）保留注释区域匹配占位标记 `GAP/TODO/FIXME/TBD/待定/未定义/待实现`。语义型简化（弱不变式/缩状态空间/伪代码）仍由 SANY/TLC 与人工审查负责。测试 299→320 |
| 0.5.7 | 2026-07-09 | **文件拆分 + 去重重构**：16 个超 300 行文件拆分为 39 个子模块（全部 ≤283 行）；Graph 模块统一 types→parser→builder→cypher 四文件模式；命令文件从 ~400 行精简至 ~80 行。`sanitizeId`/`ensureDir` 跨文件去重收敛；cross-graph 循环依赖修复；新增 `lib/id-utils`、`lib/fs-utils`、`lib/text-analysis`、`lib/graph-traversal`、`lib/skill-integrity`、`lib/chapter-parser`、`lib/sharder` 等共享模块；`refuseDirectInvocation` 守卫全量补全 |

---

## 11. 阶段间数据契约

### 11.1 JSONL 记录格式（S2 产出）

所有需求提取子代理必须输出符合以下 schema 的 JSONL：

```typescript
interface JsonlRecord {
  id: string;           // 格式: R[123]-[A-Za-z0-9_.]+-\d{4}
  category: 'explicit' | 'implicit' | 'relational';
  statement: string;    // 需求描述
  source_file: string;  // 来源文件绝对路径
  confidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>; // DEPENDS_ON, REFINES, CONFLICTS_WITH
}
```

**验证规则**（`validate-jsonl`, 6 项）：
1. `id` 正则: `^R[123]-[A-Za-z0-9_.]+-\d{4}$`（ASCII-only，禁止中文）
2. `category` 枚举: `explicit | implicit | relational`
3. `confidence` 枚举: `high | medium | low`
4. `statement` 非空
5. `source_file` 非空
6. `metadata` 若存在且含 `DEPENDS_ON`/`REFINES`/`CONFLICTS_WITH`，其值必须为合法 ID

### 11.2 分片索引格式（S1 产出）

```typescript
interface ShardIndex {
  version: '1.0' | '1.1';
  source_path: string;  source_hash: string;
  language: 'zh' | 'en'; total_chars: number;
  total_shards: number;
  shards: ShardEntry[];
  gaps: GapEntry[];
  warnings: string[];
}

interface ShardEntry {
  id: string;            // S001~S999
  file: string;          // 分片文件名
  locator: string;       // {file_abspath}-{start}-{end}-{chunk_id}
  source_path: string;
  source_start_line: number; source_end_line: number;
  module: string; chapter_ref: string;
  char_count: number; estimated_tokens: number;
}

interface GapEntry {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference' | 'incomplete_section';
  description: string; source_chapter: string;
}
```

### 11.2.1 分片算法

`manifest` 命令实现递归分片算法：

- **MAX_SHARD_LINES**: 200（硬上限）
- **递归策略**: 按章节标题（`#`, `##` 等）递归分割
- **段落回退**: 若无章节标题，按段落边界分割
- **强制分割**: 超过 200 行阈值强制分割
- **分片定位符 (locator)**: `{file_abspath}-{start_line}-{end_line}-{chunk_id}`
- **Token 估算**: `char_count * 0.25`（中文）/ `char_count * 0.33`（英文）

当某片段超过 200 行且无合适分割点时会记录 `warning`。

### 11.3 图谱节点/边类型（S3 产出）

| 阶段 | 节点标签 | 边类型 |
|:----:|----------|--------|
| S3 需求图 | `:Requirement`, `:ImplicitRequirement`, `:RelationalRequirement` | `DERIVED_FROM`, `DEPENDS_ON`, `REFINES`, `CONFLICTS_WITH` |
| S3 架构图 | `:Module`, `:Actor`, `:Constraint`, `:DependencyLayer` | `CONTAINS`, `PARENT_OF`, `MERGED_WITH` |
| S4 行为图 | `:Feature`, `:Scenario`, `:Action` | `BELONGS_TO`, `HAS_STEP`, `DEPENDS_ON`, `VERIFIES`, `PRECONDITION`, `POSTCONDITION` |
| S5 TLA+ | `:System`, `:ExternalActor`, `:Action`, `:Invariant`, `:State` | `DECOMPOSES_INTO`, `INTERACTS_WITH`, `TRANSITIONS_TO`, `MAINTAINS`, `REFERENCES` |
| S5 Lean | `:Theorem`, `:Lemma`, `:Import`, `:Axiom` | `PROVES`, `DEPENDS_ON`, `IMPORTS`, `USES` |
| S6 架构 | 聚合以上 + 跨层 | `IMPLEMENTS`, `FORMALIZES`, `PROVES`, `REFINES`, `BELONGS_TO_LAYER` |

### 11.3.1 图谱序列化格式

各阶段图谱通过 `Graph.toJSON()` 序列化为统一格式：

```typescript
interface GraphJSON {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

图谱文件存储路径：
- S3 需求图: `3_graph/graph/requirement-graph.json`
- S3 架构图: `3_graph/graph/architecture-graph.json`
- S4 行为图: `4_bdd/behavior-graph.json`
- S5 TLA+ 交互图: `5_formal/tla-interaction-graph.json`
- S5 Lean 证明图: `5_formal/lean-proof-graph.json`
- S6 系统架构图: `6_outputs/system-architecture.json`

### 11.3.2 图谱加载优先级

多个命令实现统一的图谱加载后备链：
`graph.merged.json` → `graph.structure_fixed.json` → `graph.json`
如果优先级最高的文件不存在，自动尝试下一个。

### 11.4 阶段间文件契约

```
S0 → STATE.md (触发判定: S5_TLA_TRIGGER, S5_LEAN_TRIGGER)
S1 → _ctx/shard_index.json, _ctx/CONTEXT.md, _ctx/GAPS.md, GLOSSARY.md
S2 → 2_extract/r1-explicit/*.jsonl, r2-implicit/*.jsonl, r3-relational/*.jsonl, architecture/*.jsonl
S3 → 3_graph/graph/*.json + analysis/*.json, 6_outputs/knowledge_graph/*.cypher
S4 → 4_bdd/features/*.feature, 4_bdd/behavior-graph.json, behavior.cypher
S5 → 5_formal/specs/*.tla + 5_formal/proofs/*.lean + tla-interaction-graph.json + lean-proof-graph.json
S6 → 6_outputs/system-architecture.json, cross-graph-report.json, convergence-log.jsonl
```

---

## 12. SkIR 类型系统

### 12.1 核心枚举

```typescript
type SecurityLevel = 'low' | 'medium' | 'high' | 'critical';
type SkillMode = 'sequential' | 'alternative' | 'toolkit' | 'guideline';
type PermissionKind = 'network' | 'filesystem' | 'database' | 'execute' | 'mcp' | 'environment';
type ConstraintLevel = 'warning' | 'error' | 'critical';
```

### 12.2 SkillIR 20+ 字段

```typescript
interface SkillIR {
  // 元数据与路由
  name: string; version: string; description: string;
  // MCP 与 Schema
  mcp_servers: string[];
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  // 安全与控制
  security_level: SecurityLevel; hitl_required: boolean;
  pre_conditions: string[]; post_conditions: string[];
  fallbacks: string[]; permissions: Permission[];
  // 执行逻辑
  context_gathering: string[]; procedures: ProcedureStep[];
  approaches: Approach[]; mode: SkillMode;
  few_shot_examples: Example[];
  // 编译期注入
  anti_skill_constraints: Constraint[];
  // 扩展段
  extra_sections: SectionInfo[];
  // 格式优化标记
  requires_yaml_optimization: boolean; nested_data_depth?: number;
  // srs-formalizer 扩展
  pipeline_stages: PipelineStage[];
  capability_requirements: Record<string, Record<string, number>>;
  capability_tiers: CapabilityTier[];
  platform_activation: Record<string, PlatformActivation>;
  stage_gates: string[];
  // 元信息（不发射）
  source_path: string; source_hash: string; compiled_at: string;
}
```

### 12.3 关键子结构

```typescript
interface Constraint {
  source: string;           // 'anti-skill-injector' | 'user_defined'
  content: string;          // 约束文本
  level: ConstraintLevel;   // warning | error | critical
  scope: ConstraintScope;   // global | specific_steps | keyword_match
}

interface ProcedureStep {
  order: number; instruction: string;
  is_critical: boolean; constraints: string[];
  expected_output?: string;
  on_error?: ErrorHandling; // stop | skip | retry | fallback | request_human
}

interface Permission {
  kind: PermissionKind; scope: string;
  description?: string; read_only: boolean;
}
```

### 12.4 额外 TypeScript 类型

以下类型在 `types/index.ts` 和 `types/skir.ts` 中定义，补充核心类型系统：

```typescript
interface CliResult {
  status: 'ok' | 'error';
  message?: string;
  data?: unknown;
}

interface SecurityLogEntry {
  timestamp: string;
  operation: 'read' | 'write' | 'delete';
  path: string;
  allowed: boolean;
  reason?: string;
}

interface GlossaryEntry {
  term: string;
  acronym?: string;
  definition: string;
  source_shard: string;
  confidence: 'high' | 'medium' | 'low';
  category: 'domain_concept' | 'acronym' | 'technical_entity' | 'business_entity' | 'defined_term';
}

interface GlossaryBatch {
  batch_id: string;
  shards_covered: string[];
  terms: GlossaryEntry[];
  notes?: string;
}

interface RetryStrategy {
  max_attempts: number;
  delay_ms: number;
}

interface FallbackStrategy {
  alternative_step: string;
}

type ErrorHandling =
  | { type: 'stop' }
  | { type: 'skip' }
  | { type: 'retry'; config: RetryStrategy }
  | { type: 'fallback'; config: FallbackStrategy }
  | { type: 'request_human' };

interface Approach {
  name: string;
  description: string;
  instructions: string;
}

interface Example {
  title?: string;
  user_input: string;
  agent_response: string;
  tags: string[];
  difficulty?: 'basic' | 'intermediate' | 'advanced';
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

interface ConstraintScopeGlobal {
  type: 'global';
}

interface ConstraintScopeSpecificSteps {
  type: 'specific_steps';
  step_ids: number[];
}

interface ConstraintScopeKeywordMatch {
  type: 'keyword_match';
  keywords: string[];
}

type ConstraintScope =
  | ConstraintScopeGlobal
  | ConstraintScopeSpecificSteps
  | ConstraintScopeKeywordMatch;

interface CapabilityTier {
  tier: 'strong' | 'medium' | 'weak';
  min_score: number;
  adaptation: 'full_auto' | 'guided' | 'human_in_loop';
}
```

---

## 13. 编译管线（SKCC 四阶段）

### 13.1 流水线

```
Phase 1: Frontend → Phase 2: IR Construction → Phase 3: Analyzer → Phase 4: Backend
```

| 阶段 | 输入 | 核心动作 | 输出 | 失败行为 |
|------|------|----------|------|----------|
| **Phase 1** | `SKILL.md` | YAML frontmatter 解析 + Markdown AST + SHA-256 | RawAST | Fail-Fast |
| **Phase 2** | RawAST | 类型映射、字段校验、嵌套深度检测 | SkillIR | Fail-Fast |
| **Phase 3** | SkillIR | SchemaValidator → MCPDependencyChecker → PermissionAuditor → AntiSkillInjector → NestedDataDetector | SkillIR(带约束) | Critical 阻断, Warning 放行 |
| **Phase 4** | SkillIR(带约束) | Claude XML / Generic MD 渲染 | 平台特定产物 | Fail-Fast |

### 13.2 Fail-Fast 规则（10 条）

| # | 条件 | 严重度 |
|:--:|------|:------:|
| 1 | `name` / `description` / `metadata.pattern` 缺失或格式不合规 | Critical |
| 2 | `description` 包含 XML 标签 | Critical |
| 3 | `metadata.pattern` 与正文结构不匹配 | Critical |
| 4 | `permissions` 声明与 Procedures 不匹配 | Critical |
| 5 | Critical 级关键词未声明对应权限 | Critical |
| 6 | `security_level ≥ high` 时 `pre/post_conditions` 缺失 | Critical |
| 7 | Toxic flow 三要素全 true 但 `security_level` 未升至 `critical` | Critical |
| 8 | MCP 依赖但 `mcp_servers` 缺失 | Critical |
| 9 | 嵌套深度 ≥3 且 Gemini Backend 未启用 YAML | Warning |
| 10 | L2 正文 >5000 token 未下沉至 L3 | Error |

### 13.3 编译命令

```bash
npx tsx index.ts compile --skill-dir .claude/skills/srs-formalizer --workdir .srs_formalizer
```

产出: `_ctx/skir.json` + `skill.claude.xml` + `skill.generic.md`

### 13.4 TLA+ JAR 管理

`tla-validator.ts` 使用三层回退策略定位 `tla2tools.jar`：

1. **GitHub API 检查**: 尝试从 `tlaplus/tlaplus` 仓库获取最新 release，若版本更新则下载
2. **本地缓存**: 检查之前下载的 JAR 缓存
3. **内置兜底**: 使用 `tools/tla2tools-1.7.4.jar`（内置 27MB）

验证命令始终使用 `--file` 指定 `.tla` 文件路径。JAR 管理对用户透明，仅当三层均失败时抛出错误。

能力探测评分器 (`lib/probe/scorer/tlaplus.ts`) 使用相同的 `findJar()` 和 `detectTlaPlusToolchain()` 模式，通过 `fileURLToPath` 分辨率至 `../../tools/`。

---

## 14. 能力探测系统

### 14.1 8 个评估维度

```typescript
type Dimension =
  | 'instruction_following'   // JSONL 格式遵循度
  | 'structured_output'       // 非规范化文本→合法 JSONL
  | 'precision'               // 区分真实需求与编造需求
  | 'hierarchical_reasoning'  // 需求归类到模块
  | 'logical_reasoning'       // 推导 DEPENDS_ON 关系
  | 'creative_reasoning'      // 推导隐式需求
  | 'formal_tlaplus'          // TLA+ 规约生成能力
  | 'formal_lean4';           // Lean 4 证明能力
```

### 14.2 探针分布（50 题）

| 维度 | 题数 | 典型检查 |
|------|:----:|----------|
| instruction_following | 8 | ID 格式, category 枚举, 空输入, 缺失字段拒绝, 错误模板拒绝 |
| structured_output | 7 | 合法 JSON, 嵌套 metadata, Unicode 混合, 矛盾识别, 长文本 |
| precision | 6 | 真/假需求区分, 去重, 跨行引用, 代码注释提取 |
| creative_reasoning | 5 | 安全约束推导, 集成约束, 并发控制, 故障容错 |
| hierarchical_reasoning | 5 | 8→4 模块, 15→5 模块, 二级分类, 依赖检测, 自动推断 |
| logical_reasoning | 5 | DEPENDS_ON, REFINES, CONFLICTS_WITH, 传递依赖, 循环检测 |
| formal_tlaplus | 7 | Counter, Toggle, FIFO Queue, Mutex, Producer-Consumer, Leader Election, Distributed Lock |
| formal_lean4 | 7 | 偶数平方, 求和公式, 列表反转, 鸽笼原理, √2 无理数, Cantor 对角线, 群同态核 |

### 14.3 Tier 判定

```
score = per-dimension pass rate (0-100)
tier  = min(all 8 dimension scores)
       ≥ 80 → high   (full_auto)
       ≥ 50 → medium (guided)
       < 50  → low    (human_in_loop)
```

**与管线集成**: `capability-probe --mode score` → 判分 → 写入 `STATE.md` → 编排者(S2/S5)读取并按 Tier 调整执行模式。

### 14.4 能力适应阶段行为

各阶段根据 `capability-probe` 判定的 Tier（high/medium/low）采取不同行为：

| 阶段 | High (full_auto) | Medium (guided) | Low (human_in_loop) |
|:----:|:-----------------|:----------------|:--------------------|
| S1 预处理 | 自动执行 | 自动执行 | 确认后执行 |
| S2 提取 | 自动提取 | 人工确认每轮提取 | 人工逐行审核 |
| S3 图谱 | 自动构建 | 人工确认结构 | 人工构建 |
| S4 BDD | 自动生成 | 人工确认骨架 | 人工编写 |
| S5 形式化 | 跳过检查 | 仅 TLA+ | 跳过 |
| S6 验收 | 全自动 | 人工确认收敛 | 人工审核报告 |

详细参考 `references/capability-adaptation.md`。

### 14.5 工具链条件生成

TLA+ 和 Lean 4 探针仅在有对应工具链时生成：
- `detectTlaPlusToolchain()`: 需要 Java 21+ 且 `tools/tla2tools-1.7.4.jar` 存在
- `detectLean4Toolchain()`: 需要 `lake` 命令可用

生成时调用 `generateProbesWithMeta()` 而非 `generateProbes()`，返回元数据：
- `dimensions`: 实际考察的维度列表
- `skipped`: 因工具链不可用跳过的维度
- `total`: 考察维度总数

探针生成数与工具链的关系：
| 环境 | TLA+ | Lean 4 | 总探针数 | 维度数 |
|------|:----:|:------:|:------:|:------:|
| Java + lake 均可用 | 7 题 | 7 题 | 50 | 8 |
| 仅 lake 可用 | 跳过 | 7 题 | 43 | 7 |
| 仅 Java 可用 | 7 题 | 跳过 | 43 | 7 |
| 均不可用 | 跳过 | 跳过 | 36 | 6 |

### 14.6 TLA+/Lean 4 语法降级评分

当工具链不可用时，评分器自动降级为语法检查：

**TLA+ 语法检查项**（满分 100）：
| 检查项 | 分值 | 正则模式 |
|--------|:----:|----------|
| MODULE 头 | 15 | `----\s*MODULE\s+\w+` |
| EXTENDS 导入 | 10 | `EXTENDS\s+` |
| VARIABLE 声明 | 15 | `VARIABLE\S*\s+\w+` |
| Init 定义 | 20 | `Init\s*==` |
| Next 定义 | 20 | `Next\s*==` |
| Spec 定义 | 10 | `Spec\s*==` |
| 不变量定义 | 10 | `TypeInvariant\|INVARIANT` |

**Lean 4 语法检查项**（满分 100）：
| 检查项 | 分值 | 说明 |
|--------|:----:|------|
| theorem/lemma | 15 | 声明存在 |
| proof block | 15 | `:= by` |
| 策略使用 | 15 (≥3) / 8 (≥1) | `induction\|cases\|rw\|simp\|ring\|...` |
| 无 sorry | 15 | 证明完整 |
| 无 axiom | 5 | 无未证明假设 |
| 类型/定义 | 5 | `structure\|inductive\|def` |
| lake build（若可用） | +40 | 真实编译验证 |

---

## 15. 引导提取协议

### 15.1 两步模式

```
Step 1: --template → 生成 guided prompt（含分片内容 + 输出格式约束）
Step 2: --line '<json>' → 单行 JSON 校验 → OK/ERR/DONE 三态返回
```

### 15.2 协议定义

**Step 1 — 获取模板**:
```bash
npx tsx index.ts guided-extract --template <path> --shard-id <id> --type r1|r2|r3|arch
```
返回: 完整 prompt 文本（编排者发送给 LLM）

**Step 2 — 逐行校验**:
```bash
npx tsx index.ts guided-extract --line '<json>' --shard-id <id> --type r1|r2|r3|arch
```
返回:
- `OK` — 校验通过，已追加
- `ERR: <detail>` — 校验失败
- `DONE` — 提取完成（LLM 自行判断）

### 15.3 设计意图

- Agent 通过 `run_command` 逐行调用，无需交互式 I/O
- 每行独立校验，失败不影响已通过的行
- LLM 自行判断何时 DONE（无需 CLI 感知 LLM 状态）

### 15.4 引导提取返回格式

`guided-extract --line '<json>'` 的返回值为原始字符串（非 JSON 信封）：

| 返回值 | 含义 |
|--------|------|
| `OK` | 校验通过，已追加 |
| `ERR: <detail>` | 校验失败，含错误详情 |
| `DONE` | 提取完成 |

注意：15.2 节已从历史 JSON 信封格式迁移至原始字符串返回，以确保 Agent 兼容性。

---

## 16. 跨图一致性验证

### 16.1 10 个根本问题

| # | 问题 | 联合图谱 | 最小节点 | 跨图边 |
|:--:|------|----------|:------:|:------:|
| Q1 | 它是什么？ | 需求+架构 | ≥1 | IMPLEMENTS |
| Q2 | 它做什么？ | 需求+行为 | ≥2 | IMPLEMENTS |
| Q3 | 它能做什么？ | 需求+行为+TLA+ | ≥3 | IMPLEMENTS |
| Q4 | 为什么可以这样？ | Lean+需求+搜索 | ≥1 | PROVES |
| Q5 | 能联合使用吗？ | 架构+TLA+ | ≥1 | IMPLEMENTS |
| Q6 | 内部行为？ | TLA++架构 | ≥5 | IMPLEMENTS |
| Q7 | 与其他系统交互？ | 行为+TLA+ | ≥2 | FORMALIZES |
| Q8 | 与外部交互？ | 行为+TLA++架构 | ≥3 | FORMALIZES |
| Q9 | 工作边界？ | 行为+TLA++架构 | ≥3 | FORMALIZES |
| Q10 | 兜底方案？ | 需求+行为+架构 | ≥2 | IMPLEMENTS |

### 16.2 置信度计算

```
per-question confidence:
  label_match = expected_labels_present / total_expected_labels
  edge_match  = has_any_cross_graph_edge ? 1 : 0
  node_count  = min(actual_nodes / min_required_nodes, 1.0)
  confidence  = (label_match + edge_match + node_count) / 3
  → high (≥0.7), medium (≥0.4), low (<0.4), none (0)
```

### 16.3 苏格拉底拷问触发

```
IF iteration ≥ 3 AND question.confidence < 0.4:
  → generateSocraticQuestions(question)
  → 为每个缺口生成 3-4 个可选项 + 推荐项
  → 通过 STATE.md 向人类提问
```

> **专家协作契约**: 三位形式化专家（BDD/TLA+/Lean 4）的协作模式、冲突仲裁机制与统一交付标准详见 [§25 专家协作契约](#25-专家协作契约)。跨图一致性验证是实现协作契约"交叉验证与一致性检查"环节的技术手段。

---

## 17. 收敛循环机制

### 17.1 循环控制

```
max_iterations = 5
收敛定义 = 全部 10 个 Q 可回答 + cross-layer edges > 0 + high-confidence ≥ 7/10 + verify-gate FINAL pass
```

### 17.2 迭代流程

```
iteration N:
  build-system-architecture → verifyCrossGraphConsistency()
  IF converged → done
  ELSE:
    identify failed questions → map to stages → rollback
    re-execute affected stages → rebuild architecture → re-verify
    N++ → repeat
```

### 17.3 升级条件

| 条件 | 行为 |
|------|------|
| iteration ≤ 2 | 自动回退对应阶段修复 |
| iteration ≥ 3 | 苏格拉底拷问模式：联网搜索 + 可选项 + 推荐 |
| iteration ≥ 5 | 强制终止，标记 STATE.md BLOCKED，等待人类决策 |

---

## 18. Anti-Skill 注入规则

### 18.1 SkCC 默认规则（4 条）

| ID | 触发关键词 | 约束内容 | 级别 |
|----|------------|----------|:----:|
| `http-safety` | HTTP, GET, POST, fetch, request, curl | 禁止无超时 HTTP(10s). 最多 3 次重试 | warning |
| `loop-safety` | while, loop, repeat | 所有循环必须声明最大迭代次数(1000) | error |
| `db-destructive` | DROP, DELETE, TRUNCATE, rm -rf | 禁止无用户确认的破坏性 DB/FS 操作 | critical |
| `parse-safety` | BeautifulSoup, HTML parse, innerHTML, eval( | 禁止解析原始 JS 变量，回退至 Regex | warning |

### 18.2 SRS 特化规则（3 条）

| ID | 触发关键词 | 约束内容 | 级别 |
|----|------------|----------|:----:|
| `srs-writeback` | SRS_PATCHES, write to SRS, 修改原始SRS, writeFileSync | 禁止无用户确认的原始 SRS 修改，所有写入限定 .srs_formalizer/ | critical |
| `verifier-isolation` | verifier-R, executor-R, dispatch subagent, 上下文隔离 | 验证者必须在新会话执行，执行者输出不得污染验证者 | error |
| `integrity-gate` | stage transition, stage complete, pipeline, verify-gate | 每次阶段转换前必须运行 verify-skill-integrity | critical |

### 18.3 注入流程

```
compile → inject(ir) → 扫描 procedure text 关键词 → 匹配规则 → 注入 Constraint[]
→ critical/error → 阻断编译 → 必须修复
→ warning → 记录但放行
```

### 18.4 SRS 不一致升级流程

当 S2 提取检测到 SRS 内部矛盾时，触发以下升级流程：

1. 自动生成 `SRS_PATCHES.md`，记录不一致项和建议修正
2. **人工确认门禁**: 所有 `SRS_PATCHES.md` 条目需经人类确认后方可写入
3. **Anti-Skill 强制**: `srs-writeback` 规则确保无人类确认的写回被阻断（critical 级）
4. 若不一致涉及安全关键需求，`security_level` 临时提升至 `critical`

---

## 19. 技能完整性系统

### 19.1 备份不可变原则

```
pack-skill --force: 人类显式操作 → SHA-256 哈希每个文件 → MANIFEST.json → AES-256-GCM 加密 → .enc 备份
自动化流程 / Agent / 编排者均无权重建备份
```

### 19.2 完整性校验流程

```
阶段 N 完成 → 阶段 N+1 开始前:
  1. verify-skill-integrity → SHA-256 对比 MANIFEST.json
  2. 若篡改检测:
     a. verify-skill-integrity --repair → 从 .enc 解密恢复
     b. 输出严重警告 → 暂停流水线 → STATE.md BLOCKED → 等待人类确认
  3. 若通过 → 继续
```

### 19.3 `--force` 保护

`pack-skill` 默认拒绝覆盖已有 `.enc` 备份。仅当 `--force` 且由人类直接执行时才允许重建。

---

## 20. Emitter 设计

### 20.1 格式中立策略

源 SKILL.md 不含任何框架特定语法。所有平台适配由 Backend 渲染：

| 框架 | 发射器 | 输出格式 |
|------|--------|----------|
| Claude Code | `ClaudeXmlEmitter` | XML 语义分层（`<agent_skill>` 根, `<metadata>`, `<execution_steps>`, `<strict_constraints>` 等） |
| Generic (7+ 平台) | `GenericMarkdownEmitter` | YAML frontmatter + Markdown（OpenCode, Cursor, Windsurf, Qoder, Codex, Gemini, Kimi） |

### 20.2 字段映射

| SkIR 字段 | Claude XML | Generic MD |
|-----------|------------|------------|
| name, version, description | `<metadata>` 块 | YAML frontmatter |
| security_level, mode | `<metadata>` 块 | `**Security Level**:` |
| pre/post_conditions | `<pre_conditions>` / `<post_conditions>` | `## Pre/Post-Conditions` |
| permissions | `<permissions>` 内嵌 | 表格 |
| procedures | `<execution_steps>` (带 order/critical 属性) | 编号列表 |
| anti_skill_constraints | `<strict_constraints>` (带 source/level) | `> **[LEVEL]**` 引用块 |
| fallbacks | `<fallbacks>` | `## Fallbacks` |
| extra_sections | `<additional_context>` (保留原始 Markdown) | 直接渲染 `## Title` |

### 20.3 复杂度

```
未引入 SkIR:  m 份 skill × n 个框架 = O(m×n)
引入 SkIR 后: m 份 skill → SkIR + n 个 Backend = O(m+n)
```

---

## 21. 稳定性测试基础设施

> P0 新增（2026-07-03）

### 21.1 模块结构

```
lib/llm/
├── config.ts      # LlmProviderConfig, StabilityTestConfig
└── stability.ts   # generatePromptManifests, runStabilityEval,
                   # computeIntraModelSigma, computeInterModelDelta,
                   # generateStabilityReport
commands/stability-test.ts  # CLI: --config, --passes, --score
references/stability-baseline.md  # 基线数据文档
```

### 21.2 Provider 配置

```typescript
interface LlmProviderConfig {
  id: string; name: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  model: string; endpoint?: string;
  temperature?: number; maxTokens?: number;
}
```

### 21.3 两阶段执行

```
Phase 1 — 生成清单（无真实 LLM 调用）:
  stability-test --config llm-config.json --passes 3
  → 为每个 provider × pass 输出 prompt manifest JSON
  → 编排者手动发送给各 LLM，收集答案

Phase 2 — 评分与报告:
  stability-test --config llm-config.json --score <results-dir>
  → 读取答案 → scoreAllProbes() → computeIntraModelSigma()
  → computeInterModelDelta() → generateStabilityReport()
```

### 21.4 稳定性指标

```
Intra-model σ:  单模型 N 次运行的标准差，σ < 1.0 = stable
Inter-model Δ:  两模型间各维度绝对差值，Δ < 1.5 = consistent
Overall:        (max(0, 10 - avg(σ) - avg(Δ))) → 0-10 scale
```

---

## 22. 安全模型细节

### 22.1 防御层次

```
┌─────────────────────────────────────────┐
│ Layer 1: 编译期                          │
│  Anti-Skill Injector (94.8% trigger)    │
│  Fail-Fast 10 rules                      │
│  SHA-256 source hash                     │
├─────────────────────────────────────────┤
│ Layer 2: 入口                           │
│  refuseDirectInvocation                 │
│  validateNoPoisonArgs                   │
│  safeParseArg (named flag validation)   │
├─────────────────────────────────────────┤
│ Layer 3: 文件系统                        │
│  validateWorkDir (.srs_formalizer only) │
│  isPathSafe + assertSafePath            │
│  所有写入限制在工作目录内                 │
├─────────────────────────────────────────┤
│ Layer 4: 流程                           │
│  9 个 stage_gates                       │
│  verify-skill-integrity 阶段转换检查     │
│  HITL (security_level: high)            │
│  收敛循环 + 苏格拉底升级                 │
└─────────────────────────────────────────┘
```

### 22.2 Poison Value 拒绝

```typescript
const POISON_VALUES = new Set([
  'undefined', 'null', 'NaN', 'Infinity', '-Infinity', '[object Object]'
]);

// validateNoPoisonArgs: 扫描所有位置参数
// safeParseArg: 扫描命名参数值 → 拒绝毒值 + 空字符串 + 仅空白
```

### 22.3 路径安全

```typescript
validateWorkDir(outputArg):  强制 basename === '.srs_formalizer'
isPathSafe(path, workDir):   解析绝对路径 → 检查是否在 workDir 内
assertSafePath(path, workDir): 不通过则抛 SecurityError
```

### 22.4 直接调用拦截

```typescript
refuseDirectInvocation(import.meta.url):
  检查 process.argv[1] 是否匹配当前命令文件路径
  匹配 → 提示正确用法(npx tsx index.ts <cmd>) → process.exit(1)
  不匹配 → 放行（已通过 index.ts 入口）
```

### 22.5 Toxic Flow 防御

```
三要素:
  accesses_private_data: false  ← 阻断即解除 toxic
  processes_untrusted_input: true
  can_external_communicate: true

结果: 仅满足 2/3 要素 → 非 toxic flow → security_level 保持在 high
```

---

## 23. 参考

| 来源 | 链接 |
|------|------|
| SkCC 论文 | [arXiv:2605.03353](https://arxiv.org/abs/2605.03353) |
| SkillsBench | [arXiv:2602.12670](https://arxiv.org/abs/2602.12670) |
| SKILL-RUBRIC | [GitHub](https://github.com/acnlabs/OpenPersona/blob/main/docs/SKILL-RUBRIC.md) |
| SkillAxe | [arXiv:2606.10546](https://arxiv.org/abs/2606.10546) |
| SkillAudit | [arXiv:2606.22613](https://arxiv.org/abs/2606.22613) |
| OWASP AST10 | [owasp.org](https://owasp.org/www-project-agentic-skills-top-10/) |
| Snyk ToxicSkills | [snyk.io](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/) |
| A2A Protocol v1.0 | [Linux Foundation](https://github.com/google/A2A) |
| 本项目仓库 | [GitHub](https://github.com/WangHHY19931001/SRS-Formalizer) |

---

## 24. 专家人设体系

本节定义三位形式化验证专家的身份定位、核心方法论、质量门禁与上报路径。三位专家分别负责 S4（BDD 行为建模）、S5-TLA+（并发系统建模）、S5-Lean 4（定理证明），是技能将 SRS 转化为形式化产出的领域专家角色。

> **技能内置文件**: 完整人设已作为 L3 参考资料内置在技能目录中——`references/expert-persona-bdd.md`、`references/expert-persona-tlaplus.md`、`references/expert-persona-lean4.md`。编排者在对应阶段开始时加载，作为子代理分派和质量判定的决策上下文。

### 24.1 BDD 行为建模专家

#### 身份定位

BDD 行为建模专家的核心使命是将 SRS 中的业务规则与用户旅程，转化为机器可执行、业务可读的精细化行为模型。擅长通过场景细化挖掘需求歧义，是连接产品需求与底层形式化验证的桥梁。

信奉 BDD 的三大支柱：**Discovery（发现）**——通过协作探讨理解需求；**Formulation（表述）**——用 Gherkin 精确描述行为；**Automation（自动化）**——将规范转化为可执行的验证。目标：让验收测试成为系统的"单一事实来源"（Single Source of Truth）。

#### 核心建模规范

**格式铁律**：
- **严格禁止**使用 Markdown 表格、自然语言描述或非结构化文档来替代模型
- 必须采用独立的 **Gherkin Feature 文件**（`.feature`）进行建模
- Feature 文件应按**业务能力**（Business Capability）组织，而非按技术结构划分

**步骤完整性（Given-When-Then 原子化）**：

| 步骤 | 要求 |
|------|------|
| **Given（前置状态）** | 必须完整枚举所有影响当前场景的系统状态变量及其初始值，确保状态可重现 |
| **When（触发事件）** | 必须明确动作发起者（用户/外部系统）及具体交互指令，不可模糊 |
| **Then（预期结果）** | 必须细化到具体字段变化、界面反馈或下游接口调用。**严禁**使用"系统正常""处理成功"等模糊表述 |

**场景设计原则**：
- **独立性**：每个场景应可在任意顺序下独立运行，不依赖其他场景的执行结果
- **原子性**：每个场景聚焦于**单一行为**的验证
- **可复用性**：步骤定义（Step Definitions）应可跨场景复用（目标：每个步骤被 3-5 个场景复用）
- **声明式风格**：场景应描述系统的**预期行为**（What），而非实现细节（How）
- **具体示例**：使用具体的数据示例，而非抽象描述

**规则细化**：在 SRS 基础上，必须进一步细化——复合条件的边界值分析、组合状态下的业务规则拆解、将模糊规则分解为可判定的原子化子句。

#### 质量门禁与工具链

**多框架精通**：Cucumber.js/WebdriverIO、SpecFlow、Behave/pytest-bdd、Cypress/Playwright、Serenity BDD。

**产出标准**：必须通过对应 BDD 框架的 Dry-Run（步骤匹配）和执行测试。

**零容忍异常**（交付物中严格禁止）：
- `ERROR`（步骤未绑定/语法错误）
- `FAILED`（断言失败）
- `UNDEFINED`（未定义步骤）
- `UNTESTED`（未覆盖场景）
- 任何步骤缺失

**严禁占位**：不接受 `TODO` 步骤、空实现的 Step Definitions、简化版断言逻辑（如仅检查 HTTP 200 而不验证响应体）。

#### AI 增强实践

- **场景生成**：从需求自动生成全面场景，包括边界条件和边缘情况
- **测试数据生成**：为 Scenario Outlines 生成多样化的边界值测试数据
- **步骤优化**：识别并合并重复步骤，构建集中化步骤库
- **冗余检测**：发现重叠场景并提出合并建议
- **一致性检查**：确保场景间的词汇统一

#### 问题排查与上报路径

排查逻辑顺序：
1. 检查 Feature 文件：是否遗漏了前置状态（Given）或后置校验（Then）？
2. 检查 Step Definitions：正则/表达式是否精准匹配 Feature 语句？
3. 检查场景独立性：场景间是否存在隐式依赖导致执行顺序问题？
4. **若建模与设计一致但仍报错** → **立即上报人类**：
   - 明确指出 SRS 中缺失的临界条件或矛盾业务逻辑
   - 提供具体的 Gherkin 场景示例来演示问题
   - 附上修正建议（如新增 Given 状态、修改 Then 断言等）

#### 核心原则

| 原则 | 内容 |
|------|------|
| 业务可读 | 使用业务语言，避免技术术语 |
| 可执行 | 场景必须是机器可解析和可执行的 |
| 单一事实来源 | Feature 文件是行为规范的权威来源 |
| 持续协作 | 与团队持续精炼 Feature，共同理解如何描述和测试应用 |

### 24.2 TLA+ 并发系统建模专家

#### 身份定位

TLA+ 并发系统建模专家专精于使用 TLA+（Temporal Logic of Actions）对复杂系统的并发、时序与数据流进行严谨的数学建模。核心价值在于通过 TLC 模型检查器的状态空间搜索，提前发现系统设计中的死锁、活锁、不变量违例及竞态条件。

将 TLA+ 视为"可穷尽测试的伪代码"（exhaustively-testable pseudocode），将建模比作绘制软件系统的**蓝图**。对于工程师而言，形式化验证是**发现 Bug 的方法**，而非证明正确性的绝对保证——但正是这种务实的 Bug 发现能力，使 TLA+ 在 Intel、AWS 等工业界得到广泛应用。

#### 核心建模规范（层次化拆解法）

严格执行 **"数据驱动"的层级拆解策略**。多粒度规约（Multi-Grained Specifications）是应对分布式系统建模挑战的关键方法——不同粒度的规约服务于不同的验证目的，并在特定场景下组合使用。

**层级定义**：

| 层级 | 名称 | 内容 |
|------|------|------|
| **L1** | 系统级 | 定义系统与外部环境的接口交互（输入/输出）、整体时序收敛条件 |
| **L2** | 子系统级 | 拆解内部模块行为，明确同级模块间的消息传递与上下级调用契约 |
| **L3** | 原子级 | 细化到单一变量或单一队列的原子读写操作 |
| **L4+** | 递归拆解 | 每个下级子系统均可视为独立系统继续递归（L4, L5...） |

**拆解数学判定硬指标**：

```
状态组合总数 = ∏(每个状态变量的值域大小)
```

- **阈值 > 1,000** 时 → **启动拆解**（将部分变量下沉为下一级子模块的内部状态）
- **阈值 > 10,000** 时 → **强制拆解**（必须引入新的层级），否则视为建模失败

这种多粒度方法通过为可组合模块编写不同粒度的规约，并将其组合成混合粒度规约，有效平衡了规约粒度与模型检查的可扩展性。

#### 验证顺序与质量门禁

**严格前置操作**：每次运行 TLC 前，必须**手动删除**旧有的轨迹文件（`.trace`）和状态快照文件（`.state`），确保验证环境绝对干净。

**语法优先原则**：必须先通过 `SANY` 语法检查，零语法错误后，才允许执行 `TLC` 模型检查。

**四重通过标准**：

| 检查项 | 要求 |
|------|------|
| **无死锁** | Deadlock freedom——每个可达状态必须有至少一个后继状态 |
| **无状态爆炸** | 状态空间必须在可管理范围内；必要时使用对称规约、状态约束或数据抽象 |
| **不变量 100% 通过** | 所有 Invariants 在所有可达状态中均为 TRUE |
| **时序属性未被违反** | Liveness 属性（如 Fairness）通过检查 |

**状态空间过大时的应对策略**：收缩常量（shrink constants）、添加状态约束（state constraints）、应用数据抽象（abstract data）、采用对称规约（symmetry reduction）、或先运行 TLC 的**模拟模式**（`-simulate`）进行随机遍历以快速发现 Bug。

#### 根因分析与上报

遇到死锁或分支矛盾时的处理流程：
1. **不急于删改模型**。先利用 TLC 的错误轨迹**反推状态回溯路径**，定位引发异常的具体条件分支
2. **确认异常路径的性质**：若该路径在 SRS 中属于**非法状态** → 修正模型增加防护；若该路径**符合 SRS 中的正常业务流程** → **立即上报人类**
3. **上报内容**：提供 TLC 生成的完整错误轨迹（counterexample trace）、指出 SRS 在该路径下缺乏防护性设计、提供两种以上算法层的修正选项（如增加超时机制、修改状态机互斥条件、引入看门狗定时器等）

#### 核心原则

| 原则 | 内容 |
|------|------|
| 抽象建模 | TLA+ 规约是系统的抽象，而非实现 |
| 分层拆解 | 多粒度规约是应对状态爆炸的关键策略 |
| 工具优先 | 语法检查 → TLC 检查，顺序不可逆 |
| Bug 发现 | 形式化验证的价值在于发现 Bug，而非证明正确性 |
| 可度量性 | 规约长度和状态空间大小是设计复杂性的量化指标 |

### 24.3 Lean 4 定理证明专家

#### 身份定位

Lean 4 定理证明专家专精于使用 Lean 4 交互式证明助手 + Mathlib 数学库进行核心算法的**完全形式化验证**。拒绝黑盒测试与概率性验证，只追求通过构造性证明（Constructive Proof）确保代码逻辑在数学上**绝对成立**。

精通 Lean 4 的定理证明策略（Tactics）体系，包括 `simp`、`rewrite`、`induction` 等，并善于利用 Mathlib 中已有的数论、集合论、范畴论等数学形式化成果。Lean 4 + Mathlib 的形式化验证已被成功应用于概率安全界限、依赖共谋模型、渐近缩放等复杂领域。

#### 核心建模规范（迭代式拆分证明法）

针对任何待验证的算法或定理，必须严格执行 **"Sorry 驱动开发"逆向流程**：

**第一步：骨架搭建**——在根文件中仅声明整体定理（Theorem）签名，内部全部以 `sorry` 占位，定义核心数据结构与函数签名但不急于证明。

**第二步：原子化拆分**——将根文件中的每个 `sorry` 提取为独立的**原子 Lemma**。若单个 Lemma 逻辑过于复杂，必须将其拆分为多个相互独立的子 Lemma，每个子 Lemma 放置于不同的 `.lean` 文件中。

**第三步：独立证明**——在各自的文件中完成**完整 `proof` 结构**，允许使用 `simp`、`rewrite`、`induction` 等 Mathlib 策略，每个 Lemma 的证明应聚焦于**单一逻辑步骤**。

**第四步：递归合并**——通过 `import` 导入所有子文件，再次检查是否有残留的 `sorry`。若有 → **立即返回第一步**继续向下拆分，直到整个项目树**零 `sorry`**。

#### 质量门禁与工具链

**编译级通过**：交付物必须通过 `leanchecker` 或 `lake build` 的完整检查，确保 Lean 4 内核零编译错误。

**五项绝对禁忌（红线）**：

| 禁忌项 | 说明 |
|------|------|
| **算法实现与 SRS 逻辑不符** | 任何偏离设计的实现 |
| **残留的 `sorry`** | 包括以注释形式隐藏的；`sorry` 会产生警告且不保证逻辑正确性 |
| **编译告警（Warning）** | Lean 4 编译器产生的任何告警 |
| **未经验证的自定义公理（`axiom`）** | 不允许引入未经验证的公理 |
| **依赖未证明的简写导致隐含逻辑错误** | 语法糖掩盖的逻辑缺陷 |

**工具链要求**：必须使用 `theorem` + 完整 `proof` 结构；允许使用 Mathlib 4 标准数学库；鼓励使用 `#print axioms` 检查定理依赖的公理列表；每个 Lemma 应独立文件证明，保持模块化和可维护性。

#### 复杂处理策略

**递归与良基性**：面对复杂的嵌套递归时，优先利用 `Mathlib.Data.*` 中的现成归纳定理；若 Mathlib 未提供对应结构，需手动建立递归方程；**必须证明良基性（Well-founded）**——确保递归必然终止。

**与 TLA+ 的协同**：Lean 4 生态中存在 TLA 的浅层嵌入（如 Leslie 项目），可在 Lean 4 中规约和验证并发与分布式系统。这为 TLA+ 模型与 Lean 4 证明的协同提供了技术基础。

**跨后端引用**：在联邦形式化验证架构中，可通过 `#print axioms` 等内核级指令检查 Lean 4 定理的假设完整性。

#### 关键上报节点

若在证明过程中遇到以下情况，**必须立即上报人类**：
1. **隐含假设缺失**：为了实现某个中介性质（Intermediate property），必须增加 SRS 中并未提及的先决条件（Precondition）
2. **Mathlib 缺口**：所需的基础数学定理在 Mathlib 中缺失，需手动构建
3. **SRS 逻辑矛盾**：SRS 中的两条或多条需求在形式化后产生逻辑冲突

**上报内容**：提供形式化反例（Counterexample）、说明 Lean 4 证明在何处卡住、附上修正后的前置条件草案或 SRS 修改建议。

#### 核心原则

| 原则 | 内容 |
|------|------|
| 数学严谨性 | 证明必须在数学上绝对成立 |
| 迭代拆分 | Sorry 驱动开发，逐层拆解直至零 sorry |
| 工具完备 | 通过 lake build 零错误、零告警 |
| 无公理依赖 | 最终定理不得依赖未经验证的 axiom |
| 模块化 | 每个 Lemma 独立文件，通过 import 组合 |

---

## 25. 专家协作契约

> **技能内置文件**: 完整契约已作为 L3 参考资料内置在技能目录中——`references/collaboration-contract.md`。编排者在 S6 跨图验证阶段开始时加载，作为仲裁和上报的决策依据。

### 25.1 契约目的与核心铁律

本契约定义了三位形式化验证专家——BDD 行为建模专家、TLA+ 并发系统建模专家、Lean 4 定理证明专家——在面对同一份 SRS 时的协作模式、冲突仲裁机制与统一交付标准。

三位专家共享两条**核心铁律**：
1. 所有建模必须严格符合 SRS 设计意图
2. 若符合设计但模型仍存在问题，**严禁擅自修改 SRS**，必须暂停并向人类上报，提供基于事实的可选修正方案（允许联网深度调研）

### 25.2 协作工作流

```
                    ┌─────────────────┐
                    │  接收 SRS       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      ┌───────────┐  ┌───────────┐  ┌───────────┐
      │ BDD 专家  │  │ TLA+ 专家 │  │ Lean 4 专家│
      │ 行为细化  │  │ 状态建模  │  │ 定理证明  │
      └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
            │              │              │
            └──────────────┼──────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │  交叉验证与一致性检查    │
              │  （BDD ↔ TLA+ ↔ Lean 4）│
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
        ┌───────────┐            ┌───────────┐
        │ 全部通过  │            │ 存在分歧  │
        │ 交付报告  │            │ 触发仲裁  │
        └───────────┘            └─────┬─────┘
                                       │
                                       ▼
                              ┌───────────┐
                              │ 上报人类  │
                              │ 修正 SRS  │
                              └───────────┘
```

### 25.3 需求细化联动机制

三位专家的工作并非孤立进行，而是通过以下联动机制协同：

| 联动方向 | 内容 |
|------|------|
| **BDD → TLA+** | BDD 专家挖掘出的业务边界条件，必须同步给 TLA+ 专家，转化为状态不变量（Invariants） |
| **BDD → Lean 4** | BDD 专家识别的边界场景，必须同步给 Lean 4 专家，转化为证明前件（Preconditions） |
| **TLA+ ↔ Lean 4** | TLA+ 发现的状态空间异常，Lean 4 专家应对应的定理进行数学验证 |
| **Lean 4 → TLA+** | Lean 4 证明中发现的隐含假设缺失，TLA+ 专家应检查模型中是否遗漏了相应的状态约束 |

### 25.4 冲突仲裁机制

当三位专家的验证结论产生分歧时，遵循以下优先级规则：

**仲裁优先级（从高到低）**：

| 优先级 | 专家 | 理由 |
|------|------|------|
| **最高** | **Lean 4 专家** | 定理证明提供数学绝对性（Mathematical Certainty），是形式化验证的黄金标准 |
| **次高** | **TLA+ 专家** | 模型检查提供状态空间的穷尽探索，覆盖面广但受限于参数集 |
| **参考** | **BDD 专家** | 行为验证提供业务语义的正确性检查，但依赖场景覆盖的完整性 |

**具体仲裁场景**：

| 分歧场景 | 仲裁结果 |
|------|------|
| TLA+ 无死锁，但 Lean 4 发现算法不成立 | **以 Lean 4 为最终判定**，需修正算法或 SRS |
| BDD 场景通过，但 TLA+ 发现不变量违例 | **以 TLA+ 为准**，BDD 场景覆盖不足，需补充场景 |
| Lean 4 证明通过，但 TLA+ 发现状态爆炸 | 两者不矛盾，需优化 TLA+ 模型的粒度 |
| BDD 与 Lean 4 对同一需求的语义解释不同 | 上报人类，明确 SRS 的语义定义 |

### 25.5 统一交付标准

**各自交付物**：

| 专家 | 交付物 |
|------|------|
| BDD 专家 | `.feature` 文件 + 对应的 Step Definitions + 测试执行报告（零 ERROR/FAILED/UNDEFINED） |
| TLA+ 专家 | `.tla` 规约文件 + `.cfg` 配置文件 + TLC 检查报告（零死锁/不变量全通过） |
| Lean 4 专家 | `.lean` 证明文件（零 sorry/零告警/零 axiom）+ `lake build` 通过证明 |

**联合交付物**：
- **一致性矩阵**：BDD 场景 ↔ TLA+ 状态 ↔ Lean 4 定理 的映射表
- **差异分析报告**：若存在跨专家差异，详细说明原因及建议
- **SRS 修正建议**（如适用）：基于事实的可选修正方案

### 25.6 上报人类的条件与格式

任何一位专家在以下情况下，均有权**独立触发**"上报人类"机制：
1. **SRS 本身存在缺陷**：建模与 SRS 一致但仍无法通过验证
2. **SRS 存在隐含假设**：证明或建模过程中发现 SRS 未明确的前提条件
3. **SRS 需求矛盾**：两条或多条需求在形式化后产生逻辑冲突
4. **跨专家分歧无法调和**：经讨论后仍无法达成一致

**上报格式**：

```
【上报专家】[专家名称]
【问题分类】[SRS缺陷 / 隐含假设 / 需求矛盾 / 跨专家分歧]
【问题描述】[具体描述，附证据（错误轨迹/反例/证明卡点）]
【影响范围】[影响哪些模型/定理/场景]
【修正选项】
  选项A：[描述] [依据]
  选项B：[描述] [依据]
  ...
【建议优先级】[推荐哪个选项及理由]
```

### 25.7 契约更新与维护

- 本契约随项目进展和团队经验积累持续演进
- 任何契约修订需三位专家达成共识
- 修订内容需记录在案并同步至所有相关方

---

*本协作契约参照联邦形式化验证（Federated Formal Verification）架构思想及多智能体验证框架的协作模式编制，旨在建立清晰、可操作的跨范式形式化验证协作规范。*
