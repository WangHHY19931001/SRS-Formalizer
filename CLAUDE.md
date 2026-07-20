# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

srs-formalizer — 将 SRS 文档转化为形式化产出（Cypher · Gherkin · TLA+ · Lean 4）的 AI Agent 技能。

**架构**：编译器模型（Frontend → Middle-end → Backend）。所有产物从单一 SRS-IR (`srs-ir.json`) 派生。脚本只做门禁校验与专用算法，语义工作由 Agent 经 SKILL.md + prompts + references 完成。17 命令（10 门禁 + 7 工具）。

## 构建与测试

```bash
cd .claude/skills/srs-formalizer/scripts

npm install                          # devDeps: typescript, @types/node, gherkin-lint, gherklin
npm run typecheck                   # strict 模式, 0 errors 必须
npm test                            # 200 tests, 0 fail 必须
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
├── index.ts             # CLI 入口（注册表模式, 全部 refuseDirectInvocation, 17 命令）
├── commands/            # 17 命令（10 门禁校验器 + 7 工具，全部 ≤300 行）
├── lib/
│   ├── verify-gate/        # 三级门禁 (S1/R3/FINAL)
│   ├── artifacts/          # 产物路径契约 + hash 绑定 + 提升
│   ├── middle-end/         # connectivity-checker (图连通性)
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
│   ├── srs-ir.ts         # ★ SRS-IR 强类型（18 类型：SRSIR、IRNode、IREdge、NFRCategory...）
│   ├── skir.ts          # Skill IR（SkillIR、Constraint、Permission、CapabilityTier...）
│   └── index.ts          # JsonlRecord, CliResult, ShardIndex, GlossaryEntry
├── __tests__/            # 200 测试（26 文件，31 套件）
└── templates/            # 模板 + bdd-nfr-scenarios.json
```

## 关键约束

| # | 约束 | 说明 |
|:--:|------|------|
| 1 | 零运行时 npm 依赖 | devDeps: typescript, @types/node, gherkin-lint, gherklin |
| 2 | strict TS | `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` |
| 3 | 0 `any` | 错误类型使用 `unknown` + `instanceof Error` |
| 4 | 文件大小 | ≤300 行 |
| 5 | `path.join()` 强制 | 禁止字符串拼接路径 |
| 6 | 毒值拒绝 | `undefined/null/NaN/[object Object]` 入口拦截 |
| 7 | 所有命令经 `index.ts` | `refuseDirectInvocation` 阻止直接调用 |
| 8 | `--output` vs `--workdir` | Bootstrap 替代已归档的 init；所有保留命令用 `--workdir` |
| 9 | `.srs_formalizer` 强制 | `validateWorkDir` 校验 basename |
| 10 | 所有写入限工作目录 | `isPathSafe` + `assertSafePath` 双校验 |
| 11 | 形式化产物生命周期 | draft 只能经 `validate-… --strict --promote` 进入 verified；FINAL 重新计算 verified 内容 hash，并仅消费匹配 `sourceHash` 的成功报告 |
| 12 | 本地形式化工具链 | TLA+ 只使用内置 `tools/tla2tools-1.7.4.jar` 执行 SANY/TLC；Lean 必须是完整 Lake 项目，禁止验证器联网或补写候选输入 |

## 产物生命周期（强制）

Agent 只能写入 draft 或确定性目录，不能直接将 BDD、TLA+ 或 Lean 4 产物标记为 verified：

- BDD：`outputs/bdd/draft` → `outputs/bdd/verified`
- TLA+：`outputs/tlaplus/draft` → `outputs/tlaplus/verified`
- Lean 4：`outputs/lean4/draft` → `outputs/lean4/verified`
- 确定性产物：`outputs/graphs`、`outputs/fixtures`、`outputs/reports`

提升必须使用严格验证并写入成功报告：`validate-bdd --strict --promote`、`validate-tla --name <module> --strict --promote`、`validate-lean --strict --promote`。TLA+ 严格验证使用内置 JAR 真实执行 SANY 与 TLC，候选模块必须自带 matching `.cfg`；验证不会联网、下载工具或补写 cfg。Lean draft/verified 是带 `lakefile.lean` 或 `lakefile.toml` 的完整 Lake 项目。`verify-gate --stage FINAL` 仅消费 verified 内容及 `sourceHash` 与当前内容一致的验证报告；security/compliance NFR 强制要求 Lean verified 产物。



所有模块强制 TLA+ 覆盖。层次化 L1→L2→L3，IR 架构节点驱动拆解。6 类 NFR 不变式全部生成（有阈值填值，无阈值 LLM_FILL）。

## Lean 4 建模（条件触发）

security/compliance 关键词命中 → 强制。四步拆分证明循环。

## BDD 建模（必选 + 四级严格校验）

1. TS 基础结构校验 → 2. TS NFR 阈值校验 → 3. gherkin-lint 20 规则 → 4. Gherklin。任一失败打回 Frontend 重新提取需求。

## 重要约定

- **设计文档**: `docs/DESIGN.md` 是唯一事实依据。
- **错误处理**: `try/catch → { status, message }`，通过 CliResult 返回。
- **CLI 输出**: JSON 到 stdout (`{ status, message?, data? }`)，成功 exit(0)。
- Commit: Conventional Commits, `Co-Authored-By: Claude <noreply@anthropic.com>`
- 提交前: `npm run typecheck` 0 errors + `npm test` 200 tests pass + `npm run evals` pass
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
