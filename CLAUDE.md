# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

srs-formalizer — 将 SRS 文档转化为形式化产出（Cypher · Gherkin · TLA+ · Lean 4）的 AI Agent 技能。

**架构**：编译器模型（Frontend → Middle-end → Backend）。所有产物从单一 SRS-IR (`srs-ir.json`, v2.1.0) 派生。脚本只做门禁校验与专用算法，语义工作由 Agent 经 SKILL.md + prompts + references 完成。19 命令（11 门禁 + 8 工具）。

## 构建与测试

```bash
cd .claude/skills/srs-formalizer/scripts

npm install                          # devDeps: typescript, @types/node, gherkin-lint, gherklin
npm run typecheck                   # strict 模式, 0 errors 必须
npm test                            # 325 tests, 0 fail 必须
npm run evals                       # 工具链与生命周期确定性评估必须通过
```

**运行单个测试文件：**
```bash
npx tsx --test __tests__/assemble-ir.test.ts
npx tsx --test __tests__/srs-ir-types.test.ts
```

`package.json` 提供了快捷脚本：`npm run typecheck`、`npm test` 和 `npm run evals`。

## 架构

编译器三段式：**Frontend**（Parse → Shard → Extract → Build IR）→ **Middle-end**（6 analysis passes）→ **Backend**（Agent 生成产物 + validate-* 门禁）。

```
scripts/
├── index.ts             # CLI 入口（注册表模式, 全部 refuseDirectInvocation, 19 命令）
├── commands/            # 19 命令（11 门禁校验器 + 8 工具，全部 ≤300 行）
├── lib/
│   ├── verify-gate/        # 三级门禁 (S1/R3/FINAL)
│   ├── artifacts/          # 产物路径契约 + hash 绑定 + 提升
│   ├── middle-end/         # connectivity-checker (图连通性) + dataflow-analyzer (数据流四类检出)
│   ├── dataflow-extract.ts # 数据流抽取契约（校验 + canonical 归一转 IR）
│   ├── dataflow-gate.ts    # 数据流层次2注入门控（shadow 模式）
│   ├── bdd-validator.ts    # BDD Phase 1+2 校验
│   ├── bdd-tool-runner.ts  # BDD Phase 3+4 (gherkin-lint + Gherklin)
│   ├── tla-validator.ts    # TLA+ SANY+TLC 校验
│   ├── cli.ts              # 参数解析、毒值拒绝、路径安全
│   ├── security.ts         # 路径安全（与 cli.ts 重复，保留用于独立导入）
│   ├── graph.ts            # 图数据结构
│   ├── jsonl.ts            # JSONL 读写与校验
│   ├── graph-algorithms.ts # 统一图算法（BFS/连通分量/最短路径/2-hop/图加载/相似度）
│   ├── graph-operations.ts # 图合并/冲突边/同侧面边操作
│   ├── cypher.ts           # Cypher 语法校验
│   ├── id-utils.ts         # 共享 ID 清理
│   ├── fs-utils.ts         # 共享文件系统工具
│   ├── text-analysis.ts    # NLP 工具
│   ├── skill-integrity.ts  # 技能完整性加解密
│   └── checklists.ts       # 检查表工具
├── types/
│   ├── srs-ir.ts         # ★ SRS-IR 强类型（SRSIR、IRNode、IREdge、NFRCategory、data_entity 节点/数据流边...）
│   ├── skir.ts          # Skill IR（SkillIR、Constraint、Permission、CapabilityTier...）
│   └── index.ts          # JsonlRecord, CliResult, ShardIndex, GlossaryEntry
├── __tests__/            # 325 测试
└── templates/            # 模板 + bdd-nfr-scenarios.json
```

## 关键约束

| # | 约束 | 说明 |
|:--:|------|------|
| 1 | 零运行时 npm 依赖 | devDeps: typescript, @types/node, gherkin-lint, gherklin |
| 2 | strict TS | `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` |
| 3 | 0 `any` | 错误类型使用 `unknown` + `instanceof Error` |
| 4 | 文件大小 | ≤300 行 |
| 5 | `path.join()` 强制 | 禁止字符串拼接路径；产物相对路径的 manifest/hash key 统一用正斜杠（跨平台一致，见约束 13） |
| 6 | 毒值拒绝 | `undefined/null/NaN/[object Object]` 入口拦截 |
| 7 | 所有命令经 `index.ts` | `refuseDirectInvocation` 阻止直接调用 |
| 8 | `--output` vs `--workdir` | Bootstrap 替代已归档的 init；所有保留命令用 `--workdir` |
| 9 | `.srs_formalizer` 强制 | `validateWorkDir` 校验 basename |
| 10 | 所有写入限工作目录 | `isPathSafe` + `assertSafePath` 双校验 |
| 11 | 形式化产物生命周期 | draft 只能经 `validate-… --strict --promote` 进入 verified；FINAL 重新计算 verified 内容 hash，并仅消费匹配 `sourceHash` 的成功报告；TLA+ 多模块用 `promoteFilesMerge` 累加提升（不清空其他模块），FINAL 按**模块集合**核验而非文件数 |
| 12 | 本地形式化工具链 | TLA+ 只使用内置 `tools/tla2tools-1.7.4.jar` 执行 SANY/TLC；Lean 必须是完整 Lake 项目，禁止验证器联网或补写候选输入 |
| 13 | 跨平台路径 | `hashFiles` 按 basename+内容哈希（与绝对路径无关，draft/verified 切换不影响匹配）；`collectFiles`/`isPathSafe` 归一化为正斜杠，Windows/Linux(WSL2) 行为一致 |

## 产物生命周期（强制）

Agent 只能写入 draft 或确定性目录，不能直接将 BDD、TLA+ 或 Lean 4 产物标记为 verified：

- BDD：`outputs/bdd/draft` → `outputs/bdd/verified`
- TLA+：`outputs/tlaplus/draft` → `outputs/tlaplus/verified`
- Lean 4：`outputs/lean4/draft` → `outputs/lean4/verified`
- 确定性产物：`outputs/graphs`、`outputs/fixtures`、`outputs/reports`

提升必须使用严格验证并写入成功报告：`validate-bdd --strict --promote`、`validate-tla --name <module> --strict --promote`、`validate-lean --strict --promote`。TLA+ 严格验证使用内置 JAR 真实执行 SANY 与 TLC，候选模块必须自带 matching `.cfg`；验证不会联网、下载工具或补写 cfg。Lean draft/verified 是带 `lakefile.lean` 或 `lakefile.toml` 的完整 Lake 项目。`verify-gate --stage FINAL` 仅消费 verified 内容及 `sourceHash` 与当前内容一致的验证报告；security/compliance NFR 强制要求 Lean verified 产物。



所有模块强制 TLA+ 覆盖。层次化 L1→L2→L3，IR 架构节点驱动拆解。6 类 NFR 不变式全部生成（有阈值填值，无阈值 LLM_FILL）。

## 上游提取覆盖率门禁（防"假通过"）

- **S1 分片覆盖率硬核验**：`verify-gate --stage S1` 遍历 `shard_index.json` 每个分片，从 R1 记录 id 的 shard 段展开实际覆盖集；任一分片零提取即 FAIL。区间命名文件（`S001_S003.jsonl`）无法掩盖缺口（按记录 id 统计，非文件名）。确无规范的分片须在 `2_extract/r1-explicit/_empty_shards.json` 显式声明。
- **架构溯源**：每条 arch-1 记录（`ARCH-*`）必须带 `source_shard` 字段（格式 `SNNN`），`validate-architecture` 对缺失/格式错判 FAIL。
- **提取粒度**：一条 R1 = 一条可独立测试的规范陈述，禁止把小节多条 must/须/不得 折叠成一条标题句。
- 格式契约速查见 `references/artifact-contract-cheatsheet.md`。

## Frontend 多轮需求提取精细化循环

Frontend 采用**架构树版本化 × 需求提取交替演进**：F2 显式 R1 → F3a 架构树 v1 → F4a 隐含 R2 → F3b 架构树 v2（reparent/merge）→ F4b 跨子系统补全 → F3c 架构树 v3（依赖层）→ F4c 精细化补全 → F5 装配 IR → G 收敛闸门。`total_shards < 50` 退化为单版架构树；相邻版本 diff < 阈值提前收敛；迭代上限 5 轮，超限 `BLOCKED`。

**三态 provenance（守 Inversion 铁律，硬门禁）**：每条推导/补全需求落入且仅落入一态，写 `metadata.provenance`——
- `explicit-located`：源文档可逐字定位 → `category: explicit`，进 IR；
- `doc-derived`：文档可推导但非逐字 → `category: implicit` + `confidence: medium|low`，进 IR；
- `needs-clarification`：文档推导不出 → **不进 IR**，写 `GAPS.md`，走 HITL 单问题+推荐答案澄清。

`validate-jsonl` 硬校验 provenance 三态，`needs-clarification` 禁入 r*/architecture JSONL。唯一事实源 = 设计文档；跨子系统补全只从文档推导，`frozen/` 不是输入。

**收敛双闸门（`verify-gate --stage R3`）**：
- **层次性（分层深度闸门）**：架构树沿 `contains` 边最大链长 ≥2；≥3 架构节点且无层级（`flatTree`）即 FAIL。架构记录可带顶层 `arch_version`（1|2|3），`validate-architecture` 校验其与 id 前缀一致。
- **连通性（孤儿裁决闸门）**：逼近单连通图谱；孤儿分片须在 `_ctx/orphan_adjudications.json` 显式裁决 standalone（附非空 reason）或有被接受桥接边，否则 FAIL。

## 数据流审视提示（SRS-IR v2.1.0，spec 2026-07-21 / ADR-0009）

Middle-end 只读数据流分析旁路，从需求抽取数据实体与读写关系，四类检出以**强提示（warning，非硬门禁）**驱动下游加强审视：

- **抽取侧（Frontend F4e）**：Agent 经 `executor-frontend-dataflow.md` 产出 `2_extract/data-entities/*.jsonl`（`entity` 声明数据实体 + `flow` 声明读写关系）。`assemble-ir` 按 `canonical` 归一为 `data_entity` 节点 + `produces`/`consumes`/`mutates` 边写入 IR。格式经 `validate-dataflow` 校验，并纳入 `verify-gate --stage S1`（`checkDataFlowFormat`；缺失 data-entities 目录 = PASS，抽取可选）。
- **分析侧（Middle-end M1.5）**：`analyze-dataflow` 只读 IR，检出 **dead_data**（write-only）、**gap**（use-before-def）、**boundary**（外部输入/最终输出）、**cycle**（SCC，往往是 TLA+ 死锁根因），写 `3_graph/analysis/dataflow.json`。恒 warning、不 fail-closed；无 `data_entity` 的旧 IR 降级为空 findings。版本校验接受 `2.0.0` 与 `2.1.0`。
- **注入门控（shadow 模式，硬性上线前提）**：层次 2（BDD/TLA+ executor 注入）**默认关闭**——仅当 `analyze-dataflow --assess --fp-rate <r> --sample-size <n> --assessed-by <name>` 评估实体归一假阳性率达标并人工签署（写 `_ctx/dataflow_injection_gate.json`）后放开，避免误报噪声让 agent 学会性无视。

## Lean 4 建模（条件触发）

security/compliance 关键词命中 → 强制。四步拆分证明循环。

## BDD 建模（必选 + 四级严格校验）

1. TS 基础结构校验 → 2. TS NFR 阈值校验 → 3. gherkin-lint 20 规则 → 4. Gherklin。任一失败打回 Frontend 重新提取需求。

## 重要约定

- **设计文档**: `docs/DESIGN.md` 是唯一事实依据。
- **错误处理**: `try/catch → { status, message }`，通过 CliResult 返回。
- **CLI 输出**: JSON 到 stdout (`{ status, message?, data? }`)，成功 exit(0)。
- Commit: Conventional Commits, `Co-Authored-By: Claude <noreply@anthropic.com>`
- 提交前: `npm run typecheck` 0 errors + `npm test` 325 tests pass + `npm run evals` pass
- TLA+ 覆盖所有模块，6 类 NFR 不变式必生成

<!-- superpowers-zh:begin (do not edit between these markers) -->
# Superpowers-ZH 中文增强版

本项目已安装 superpowers-zh 技能框架（20 个 skills）。

## 核心规则

1. **收到任务时，先检查是否有匹配的 skill** — 哪怕只有 1% 的可能性也要检查
2. **设计先于编码** — 收到功能需求时，先用 brainstorming skill 做需求分析
3. **测试先于实现** — 写代码前先写测试（TDD）
4. **验证先于完成** — 声称完成前必须运行验证命令

## 可用 Skills

Skills 位于 `.claude/skills/` 目录，每个 skill 有独立的 `SKILL.md` 文件。

- **brainstorming**: 在任何创造性工作之前必须使用此技能——创建功能、构建组件、添加功能或修改行为。在实现之前先探索用户意图、需求和设计。
- **chinese-code-review**: 中文 review 沟通参考——话术模板、分级标注（必须修复/建议修改/仅供参考）、国内团队常见反模式应对。仅在用户显式 /chinese-code-review 时调用，不要根据上下文自动触发。
- **chinese-commit-conventions**: 中文 commit 与 changelog 配置参考——Conventional Commits 中文适配、commitlint/husky/commitizen 中文模板、conventional-changelog 中文配置。仅在用户显式 /chinese-commit-conventions 时调用，不要根据上下文自动触发。
- **chinese-documentation**: 中文文档排版参考——中英文空格、全半角标点、术语保留、链接格式、中文文案排版指北约定。仅在用户显式 /chinese-documentation 时调用，不要根据上下文自动触发。
- **chinese-git-workflow**: 国内 Git 平台配置参考——Gitee、Coding.net、极狐 GitLab、CNB 的 SSH/HTTPS/凭据/CI 接入差异与镜像同步配置。仅在用户显式 /chinese-git-workflow 时调用，不要根据上下文自动触发。
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾
- **mcp-builder**: MCP 服务器构建方法论 — 系统化构建生产级 MCP 工具，让 AI 助手连接外部能力
- **receiving-code-review**: 收到代码审查反馈后、实施建议之前使用，尤其当反馈不明确或技术上有疑问时——需要技术严谨性和验证，而非敷衍附和或盲目执行
- **requesting-code-review**: 完成任务、实现重要功能或合并前使用，用于验证工作成果是否符合要求
- **subagent-driven-development**: 当在当前会话中执行包含独立任务的实现计划时使用
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **using-git-worktrees**: 当需要开始与当前工作区隔离的功能开发，或在执行实现计划之前使用——通过原生工具或 git worktree 回退机制确保隔离工作区存在
- **using-superpowers**: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **workflow-runner**: 在 Claude Code / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
<!-- superpowers-zh:end -->
