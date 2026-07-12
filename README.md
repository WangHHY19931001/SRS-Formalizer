# SRS-Formalizer

将 SRS（软件需求规格说明）文档形式化为四项工程产物的 AI Agent 技能：

| 产出 | 格式 | 阶段 | 触发 |
|------|------|:--:|------|
| 需求知识图谱 | Neo4j Cypher | S3 | 必选 |
| BDD 测试骨架 | Gherkin `.feature` | S4 | 必选 |
| TLA+ 形式化规约 | `.tla` | S5 | 条件（并发/分布式/共识协议） |
| Lean 4 定理证明 | `.lean` | S5 | 条件（安全关键/密码学/自定义算法） |

## 快速开始

```bash
git clone https://github.com/WangHHY19931001/SRS-Formalizer.git
cd SRS-Formalizer/.claude/skills/srs-formalizer/scripts
npm install

# 初始化工作目录
npx tsx index.ts init --output .srs_formalizer

# 索引化分片
npx tsx index.ts manifest --src <srs-file-or-dir> --lang zh --workdir .srs_formalizer

# 运行测试
npx tsx --test __tests__/*.test.ts
```

## 七阶段流水线

```
S0(发现确认) → S1(预处理) → S2(需求提取+7子阶段) → S3(图谱构建)
             → S4(BDD生成+严格校验) → S5(形式化/条件触发) → S6(验收闸门+收敛循环)
```

每个阶段有对应的 CLI 命令和硬性 gate condition，不通过阻断后续。

| 阶段 | 核心产出 | 质量门禁 |
|:----:|------|------|
| S4 BDD | `.feature` 文件（独立格式, 完整 Given/When/Then, 状态+状态转换） | gherkin-lint 20 条规则严格模式, 零 error/failed/undefined/untested/占位 |
| S5 TLA+ | `.tla` 层次化建模（L1→L2→L3, 变量组合 >1w 强制拆） | SANY + TLC, 零死锁/状态爆炸/违法不变式/占位实现 |
| S5 Lean 4 | `.lean` 拆分证明（四步循环, 递归至 0 sorry） | lake build, 零 sorry/axiom/warning/占位实现 |

TS 脚本做确定性机械工作，LLM 子代理做语义判断，编排者做流程决策。

## 设计文档

完整的技能设计位于 **[docs/DESIGN.md](docs/DESIGN.md)**——它是技能开发的唯一事实依据（Single Source of Truth）。

## 技术栈

- **TypeScript 5.5+** strict 模式（`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`）
- **Node.js ≥20** ESM
- **零运行时 npm 依赖**——仅 `typescript` + `@types/node` 为 devDeps
- 测试：Node.js 原生 `node:test`（353+ 用例，含 fixture-gen 测试）
- 编译管线：SkIR（对标 SkCC, arXiv:2605.03353）→ Claude XML + Generic MD 双发射器
- 形式化工具：内置 `tla2tools-1.7.4.jar`（SANY 2.2 + TLC2 2026.05.18）+ Lean 4 + gherkin-lint

## 目录结构

```
.claude/skills/srs-formalizer/
├── SKILL.md                 # L1+L2 指令（~3,800 tokens）
├── CHANGELOG.md             # 版本变更
├── agent-card.json          # A2A Protocol v1.0
├── BASELINE.md              # TDD RED 基线
│
├── scripts/                 # TypeScript 工具链
│   ├── index.ts             # CLI 入口（注册表, 33 命令）
│   ├── package.json         # 零运行时依赖（仅 devDeps）
│   ├── tsconfig.json        # strict 模式
│   ├── commands/            # 33 条命令
│   │   ├── guided-extract.ts
│   │   ├── capability-probe.ts
│   │   ├── stability-test.ts
│   │   └── ...
│   ├── lib/                 # 27 核心 + 10 子模块
│   │   ├── cli.ts           # 参数安全 + 毒值拒绝 + 路径校验
│   │   ├── graph.ts         # 图数据结构
│   │   ├── jsonl.ts         # JSONL 读写
│   │   ├── anti-skill.ts    # 安全约束注入
│   │   ├── skir-builder.ts  # SkIR 构建
│   │   ├── cross-graph-verifier.ts
│   │   ├── tla-validator.ts
│   │   ├── fixture-gen/     # V-Model 测试 fixture 生成（bdd/tla/lean/coverage/types）
│   │   ├── probe/           # 能力探测（types + questions/ + scorer/）
│   │   ├── llm/             # 稳定性测试（config + stability）
│   │   ├── cross-graph/     # 跨图验证问题定义
│   │   ├── verify-gate/     # 三级门禁（shared + checks-s1/r3/final）
│   │   └── architecture/    # 架构图构建
│   ├── types/               # index.ts（JSONL 类型）+ skir.ts（SkillIR 20+ 字段）
│   ├── __tests__/           # 47 文件, 353 测试
│   └── templates/           # check.sh.template
│
├── prompts/                 # 28 LLM 提示词
│   ├── orchestrator_stage_S0~S6.md  # 7 编排者
│   ├── executor-R1~R5.md           # 6 执行者（R4 拆为 clarify+verify）
│   ├── executor-bdd.md             # BDD 行为建模（S4 专用, 注入专家人设）
│   ├── executor-tlaplus.md         # TLA+ 并发系统建模（S5 专用, 注入专家人设）
│   ├── executor-lean4.md           # Lean 4 定理证明（S5 专用, 注入专家人设）
│   ├── executor-arch-1~3.md        # 3 架构分解
│   ├── executor-glossary.md
│   ├── verifier-R1~R5.md           # 5 验证者
│   ├── verifier-arch.md
│   └── debug-lean.md, debug-tlc.md # 2 诊断
│
├── references/              # 17 参考文档（含 3 专家人设 + 协作契约 + 3 编码参考指南）
├── templates/               # 18 产出模板（.template + .gherkin-lintrc* + checklists/）
├── tests/                   # Golden + 验收用例 + 可追溯性矩阵
├── tools/                   # tla2tools-1.7.4.jar (SANY 2.2 + TLC2 2026.05.18)
├── examples/                # 端到端 walkthrough
└── docs/                    # DESIGN.md（唯一事实依据）
```

## 33 条 CLI 命令

| 命令 | 阶段 | 功能 |
|------|:--:|------|
| `init` | S1 | 初始化工作目录 |
| `manifest` | S1 | 索引化分片 + 章节识别 |
| `guided-extract` | S2 | 两步模式逐行 JSONL 提取 |
| `inject-prompt` | S2 | 模板参数注入 |
| `validate-jsonl` | S2 | JSONL 格式校验（6 项） |
| `validate-architecture` | S2 | 架构 JSONL 校验 |
| `validate-glossary` | S1 | 术语表校验（8 项） |
| `build-graph` | S3 | JSONL → 需求知识图谱 |
| `build-architecture` | S3 | 架构 JSONL → 架构图 |
| `analyze-structure` / `merge-structure` | S3 | 结构分析 + 合并 |
| `analyze-graph` / `merge-analysis` | S3 | 语义分析 + 合并 |
| `export-cypher` | S3 | 图谱 → Cypher 脚本 |
| `validate-cypher` | S3 | Cypher 校验（4 项） |
| `generate-bdd` | S4 | 图谱 → BDD 骨架 |
| `validate-bdd` | S4 | Gherkin 严格模式（20 条规则） |
| `build-behavior-graph` | S4 | BDD → 行为图谱 |
| `build-tla-graph` | S5 | TLA+ → 交互图谱 |
| `build-lean-graph` | S5 | Lean 4 → 证明依赖图谱 |
| `validate-tla` | S5 | SANY + TLC 严格模式 |
| `validate-lean` | S5 | lake build 验证 |
| `build-system-architecture` | S6 | 系统架构合成 |
| `query-graph` | S6 | 图谱只读查询 |
| `verify-gate` | S1/S3/S6 | 三级硬门禁 |
| `validate-checklist` | S0-6 | CHECKLIST 校验 + 修复 |
| `capability-probe` | S0 | LLM 能力探测（8 维, 条件生成） |
| `stability-test` | 评估 | 跨 LLM 稳定性测试（σ/Δ） |
| `compile` | 编译 | SKILL.md → SkIR + Anti-Skill + 多平台发射 |
| `pack-skill` | 维护 | 加密备份（AES-256-GCM） |
| `verify-skill-integrity` | 维护 | 完整性校验 + 自动修复 |
| `generate-test-fixtures` | V-Model | 从 BDD/TLA+/Lean 4 生成测试骨架（6 框架，含 NFR） |
| `fixture-coverage` | V-Model | 测试 fixture 覆盖率报告 |

完整参数见 `references/quick-reference.md`。

## 关键设计约束

- **零运行时 npm 依赖**——自包含，不引入供应链风险
- **TS 脚本只做确定性转换**——不调 LLM，不产生随机数
- **所有文件操作限定 `.srs_formalizer/`**——路径安全双校验
- **Poison value 拒绝**——`undefined/null/NaN/[object Object]` 在入口拦截
- **33/33 命令 `refuseDirectInvocation`**——禁止绕过 CLI 入口
- **0 `any` 类型**——strict TypeScript，`unknown` + `instanceof Error`
- **S5 快速退出**——无形式化需求时自动跳过，节省 token
- **能力探测条件生成**——TLA+/Lean 探针仅在有工具链时生成

### 产物建模硬性约束

| 产物 | 不可接受 | 必须通过 |
|------|----------|----------|
| **BDD** `.feature` | Markdown 描述、占位符（`THEN_PLACEHOLDER`）、`error/failed/undefined/untested`、步骤缺失、简化/错误实现 | gherkin-lint 20 条规则严格模式 + `build-behavior-graph` |
| **TLA+** `.tla` | 占位/简化/错误实现、死锁（正常系统）、状态爆炸、违法不变式 | SANY 语法检查 → TLC 模型检查（层次化 L1→L2→L3+） |
| **Lean 4** `.lean` | 占位/简化/错误实现、`sorry`、`axiom`、告警、不完整实现 | 拆分证明四步循环 + `lake build` + 每个 lemma 独立文件 + mathlib4 最新版 |

**SRS 一致性处理**：建模必须符合 SRS 设计。符合设计但仍有问题 → 报告人类 + 可选项 A/B/C + 联网调研事实依据 → 等待确认。

### 专家人设与协作

三位领域专家各司其职，内置为技能 L3 参考资料。编排者在对应阶段注入：

| 专家 | 加载时机 | 核心方法论 | 仲裁优先级 |
|------|:--:|------|:--:|
| BDD 行为建模专家 | S4 | Given-When-Then 原子化、场景独立性、声明式风格 | 参考 |
| TLA+ 并发系统建模专家 | S5 | 层次化拆解 L1→L2→L3（>1k 拆, >1w 强制拆）、SANY→TLC 严格顺序 | 次高 |
| Lean 4 定理证明专家 | S5 | Sorry 驱动开发四步逆向流程、零 sorry/axiom/warning | **最高** |

专家协作契约（S6 加载）定义了跨专家联动（BDD→TLA+/Lean 4 边界条件同步、TLA+↔Lean 4 相互验证）、冲突仲裁（Lean 4 > TLA+ > BDD）和统一上报格式。

每位专家配有编码参考指南（`references/*-coding-guide.md`），由子代理按需加载：BDD 提供 Gherkin 语法与框架对照，TLA+ 提供语法速查与 LLM 常见错误对策，Lean 4 提供声明语法与反例陷阱速查。子代理 prompt 内含精简版人设，可通过「完整人设参考」节自行加载完整方法论。

## 安全设计

| 层级 | 机制 |
|:--:|------|
| 编译期 | Anti-Skill 注入（7 条规则, 94.8% 触发率）+ 10 Fail-Fast |
| 入口 | `validateNoPoisonArgs` + `safeParseArg` + `refuseDirectInvocation` |
| 文件系统 | `validateWorkDir` + `isPathSafe` + `assertSafePath` |
| 流程 | 9 个 `stage_gates` + HITL + `verify-skill-integrity` |
| 备份 | SHA-256 哈希 + AES-256-GCM 加密 `.enc` 备份 |

## 评估

| 框架 | 结果 |
|------|:--:|
| SKILL-RUBRIC v0.1.5 | **B+** (7.4/10) — framework 类型 |
| OWASP AST10 | **9/10** 通过 |
| SkillAudit | **Low Risk** (安全 95/100) |

## Agent 自动安装

本节同时面向**人类开发者**和 **AI 编码智能体**。AI 智能体在首次遇到 SRS 文档或用户要求形式化时，应自行执行以下步骤完成技能部署。

### 前置条件

| 条件 | 检查方式 |
|------|----------|
| Node.js ≥20 | `node --version` |
| TypeScript ≥5.5（devDeps，自动安装） | `npx tsc --version` |

### Step 1：平台检测（AI 智能体执行）

按以下优先级检测当前平台，确定技能部署目标路径：

```
CLAUDE_CODE_SESSION_ID 存在 → .claude/skills/srs-formalizer/
~/.cursor/ 存在          → .cursor/skills/srs-formalizer/
~/.codex/ 存在           → .agents/skills/srs-formalizer/
以上均无               → .agents/skills/srs-formalizer/ （跨平台回退）
```

> 完整 15 平台映射见 [agent-integration-guide.md](.claude/skills/srs-formalizer/references/agent-integration-guide.md)。

### Step 2：部署技能目录

```bash
# 从克隆的仓库部署到当前项目
SKILL_SRC="$(pwd)/.claude/skills/srs-formalizer"
TARGET=".claude/skills/srs-formalizer"  # 根据 Step 1 结果调整

rm -rf "$TARGET" && cp -r "$SKILL_SRC" "$TARGET"
echo "✅ Skill deployed to $TARGET"
```

**或一行命令（Claude Code）：**
```bash
cp -r .claude/skills/srs-formalizer .claude/skills/srs-formalizer 2>/dev/null || \
  mkdir -p .claude/skills && cp -r .claude/skills/srs-formalizer .claude/skills/
```

### Step 3：安装依赖并验证

```bash
cd .claude/skills/srs-formalizer/scripts
npm install
npx tsc --noEmit          # 必须 0 errors
npx tsx --test __tests__/*.test.ts  # 必须 353 tests, 0 fail
```

### Step 4：配置自动激活（可选）

在项目的 `CLAUDE.md` 或 `AGENTS.md` 中添加以下规则，确保 AI 智能体在遇到 SRS 文档时自动触发技能：

```markdown
## SRS 处理规则（srs-formalizer）
当用户提供或引用 SRS 文档（特征："需求规格"、"§"分节、"功能需求"、"软件需求"）时：
1. 激活 srs-formalizer 技能
2. 执行 S0 发现阶段——扫描、检测触发条件、报告、等待用户确认
3. 运行 S1→S6 流水线，每阶段前执行 verify-gate
```

### 验证安装

安装成功后，向 AI 智能体发送以下消息确认技能已激活：

> "我有一个 SRS 文档需要形式化"

智能体应自动激活 srs-formalizer 技能并进入 S0 发现阶段。

### 一键自配置（AI 智能体高级模式）

如果 AI 智能体需要自动完成上述全部步骤（包括多平台 hook/rule 配置），请加载并执行：

```
references/auto-setup.md   # 平台检测 + hook 生成 + AGENTS.md 注入 + 验证
```

该文件是 AI 智能体的**可执行安装脚本**（自然语言格式），包含 15 个平台的检测逻辑和激活配置生成代码。

## 版本

| 版本 | 日期 | 关键变更 |
|------|------|----------|
| 0.7.0 | 2026-07-12 | **V-Model Zero-Gap**：模板引擎（16 模板 × 6 框架）、TLC 反例解析器、Lean hypothesis 属性测试、Playwright Page Object 生成、V-Model 追溯矩阵、NFR fixture 生成 |
| 0.6.0 | 2026-07-12 | **V-Model 测试 fixture 生成**：`generate-test-fixtures`（5 框架：Cucumber/Playwright/Pytest/JUnit/fast-check）+ `fixture-coverage` 覆盖率报告；Cypher 注入防护加固；security.ts 重复代码合并；coverage 除数动态化；Scenario Outline 支持；24 个失败测试全部修复，测试通过率 100%（353/353） |
| 0.5.7 | 2026-07-09 | **文件拆分 + 去重重构**：16 个超 300 行文件拆分为 39 个子模块（全部 ≤283 行）；`sanitizeId`/`ensureDir` 跨文件去重；cross-graph 循环依赖修复；新增 `lib/id-utils`、`lib/fs-utils`、`lib/text-analysis`、`lib/graph-traversal`、`lib/skill-integrity` 等共享模块；`refuseDirectInvocation` 守卫补全 |
| 0.5.6 | 2026-07-09 | **verify-gate 源重扫安全修复**：`checkLeanGraphExists`/`checkTlaGraphExists` 与 `build-lean-graph`/`build-tla-graph` 重扫源文件——Lean 命中 `sorry`/`axiom`、TLA+ 命中占位标记（GAP/TODO/FIXME/TBD/待定/未定义/待实现）即 fail，不再仅凭残留图谱 JSON 放行 |
| 0.5.5 | 2026-07-07 | **专家人设体系**：三位形式化专家人设 + 协作契约内置为 L3 参考资料；3 份编码参考指南（BDD/TLA+/Lean 4）；领域专用子代理提示词（executor-bdd/tlaplus/lean4）；渐进式披露模式（精简人设→完整人设→编码指南）；编排者 S4/S5/S6 按阶段注入 |
| 0.5.4 | 2026-07-07 | 产物建模约束完善：BDD 格式/状态转换强制、TLA+ 层次化拆解+轨迹清理、Lean 4 拆分证明四步循环、SRS 一致性升级流程 |
| 0.5.3 | 2026-07-03 | 能力探测工具链条件生成 + 语法降级评分、stability-test、A2A Agent Card、路径 Bug 修复 |
| 0.5.2 | 2026-07-02 | TLA+ 严格模式、Lean 4 拆分证明、gherkin-lint 20 条规则、S6 跨图验证 |
| 0.5.0 | 2026-07-01 | 分片索引化重构、移除物理分片目录 |
| 0.4.0 | 2026-07-01 | SkCC 集成：compile、SkIR、Anti-Skill、双发射器 |

完整变更历史见 [CHANGELOG.md](.claude/skills/srs-formalizer/CHANGELOG.md)。

## 参考

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- SkCC：[arXiv:2605.03353](https://arxiv.org/abs/2605.03353)
- SkillsBench：[arXiv:2602.12670](https://arxiv.org/abs/2602.12670)
- OWASP AST10：[owasp.org](https://owasp.org/www-project-agentic-skills-top-10/)
- SKILL-RUBRIC：[GitHub](https://github.com/acnlabs/OpenPersona/blob/main/docs/SKILL-RUBRIC.md)

## 许可

MIT
