# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Rules

`project_rules/` 目录包含三类强制规则，开发前必须遵守：

| 文件 | 内容 |
|------|------|
| `project_rules.md` | 构建命令、代码规范（中文注释、strict TS、Prettier）、Git 规范（Conventional Commits） |
| `methodology.md` | 四层工作方法论：决策树穷尽 + 事实交叉验证 + 渐进式文档沉淀。超过 12 万 token 上下文强制拆解子目标 |
| `skill-design-patterns.md` | Skill 设计五模式（Tool Wrapper/Generator/Reviewer/Inversion/Pipeline）、SkCC 编译四阶段、安全审计基线（Snyk 36.82% 漏洞率） |

## Project

**srs-formalizer** — 将 SRS（软件需求规格说明）文档转化为形式化产出的 AI Agent 技能：
需求知识图谱（Cypher）· BDD（Gherkin）· TLA+ 规约 · Lean 4 证明。

附带 `agent/` 目录包含 LLM 驱动的技能调测代理（编排者+工作者，支持递归子代理分派和上下文压缩）。

## Build & Test

本项目包含两个独立工程，各有独立的构建和测试命令：

### 技能工程（`.claude/skills/srs-formalizer/scripts/`）

零运行时依赖，仅 devDeps: `typescript` + `@types/node`。

```bash
cd .claude/skills/srs-formalizer/scripts

# Install
npm install

# Typecheck (strict mode)
npx tsc --noEmit

# All tests (35 files, 299 tests)
npx tsx --test __tests__/*.test.ts

# Single test file
npx tsx --test __tests__/manifest.test.ts
```

### Agent 工程（`agent/`）

独立 `package.json`，依赖 LangGraph + LangChain + openai + zod。

```bash
cd agent

# Install
npm install --legacy-peer-deps

# Typecheck (strict mode)
npx tsc --noEmit
```

Agent 集成测试（需要 LLM 服务）：

```bash
cd /home/celebi/openspec_skill_create_dir
npx tsx agent/index.ts --llm-config test-llm-config.json --task agent/task-srs-formalizer.md
```

## Architecture

### Two entry points

| Entry | Path | Purpose |
|-------|------|---------|
| Skill CLI | `.claude/skills/srs-formalizer/scripts/index.ts` | 29 commands for the skill pipeline |
| Debug Agent | `agent/index.ts` | LangGraph ReAct agent（StateGraph + ToolRegistry + A2A），读取 SKILL.md 自主发现流水线 |

### Skill pipeline (S0→S6)

```
S0(发现确认) → S1(预处理) → S2(需求提取+7子阶段) → S3(图谱构建)
             → S4(BDD生成) → S5(形式化/条件触发) → S6(验收闸门+收敛循环)
```

- **S1**: init → manifest (recursive sharding, ≤200 lines) → glossary (parallel sub-agent)
- **S2**: R1/R2/R3 extraction (guided line-by-line via `guided-extract`), arch decomposition
- **S3**: build-graph → analyze-structure → analyze-graph → export-cypher
- **S4**: generate-bdd → validate-bdd (gherkin-lint 严格模式, 20 条规则) → build-behavior-graph
- **S5**: TLA+ 严格模式 (validate-tla: -deadlock/禁止黑洞/奇迹/无限状态/死锁) / Lean 4 拆分证明四步法 (validate-lean: 0 sorry/0 axiom/0 warnings, ❌ Windows 禁止)
- **S6**: verify-gate FINAL → build-system-architecture → 跨图一致性语义验证 (10 个根本问题, 节点标签+跨图边+最小阈值检查) → 收敛循环 (≤5 次, ≥3 次触发苏格拉底拷问)

### Skill directory layout

```
.claude/skills/srs-formalizer/
├── SKILL.md              # Frontmatter (metadata, triggers, gates, capability tiers)
├── CHANGELOG.md
├── tools/                # 内置工具 (tla2tools-1.7.4.jar)
├── scripts/
│   ├── index.ts          # CLI entry (switch on command name)
│   ├── commands/         # 31 commands (init, manifest, inject-prompt, build-*, validate-*, ...)
│   ├── lib/              # lib modules (cross-graph-verifier, tla-validator, graph, jsonl, bdd, ...)
│   ├── types/            # Shared TypeScript types
│   └── __tests__/        # 35 test files, 299 tests
├── prompts/              # Orchestrator (S0-S6) + executor/verifier/debug prompts
├── references/           # Coding guides (tlaplus, lean4, gherkin-lint), integration guides
└── templates/            # Output templates + .gherkin-lintrc-strict + stage checklists
```

### Key design constraints

- **技能工程零运行时 npm 依赖** — 仅 `typescript` + `@types/node` 为 devDeps；Agent 工程独立管理依赖
- **TypeScript strict mode** (`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`)
- **All CLI commands must go through `npx tsx index.ts <cmd>`** — direct .ts invocation blocked by `refuseDirectInvocation`
- **Poison value rejection** — `undefined`, `null`, `NaN`, `[object Object]` blocked at `index.ts` entry via `validateNoPoisonArgs`
- **`init` uses `--output`**, all other commands use `--workdir`
- **Workdir must be named `.srs_formalizer`** (enforced by `validateWorkDir`)
- **Guided extraction preferred** — `guided-extract` for S2 JSONL stages (r1/r2/r3/arch)
- **BDD 严格模式** — gherkin-lint 20 条规则, 禁止 GAP/PLACEHOLDER/UNDEFINED/待定
- **TLA+ 严格模式** — 内置 tla2tools-1.7.4.jar, Java 即可, -deadlock 检测, 禁止黑洞/奇迹/无限状态/死锁/活锁
- **Lean 4 拆分证明** — 骨架→拆分→递归至 0 sorry, 0 axiom, 0 warnings, ❌ Windows 禁止, 优先 `lake exe cache get` 避免编译 mathlib4
- **S6 跨图验证** — 10 个根本问题 (Q1-Q10), 不可回答→回退修复, ≥3次→苏格拉底拷问+人类决策

### Agent framework (`agent/`)

基于 **LangGraph StateGraph** 的 ReAct Agent，替代了旧的 OpenAI 直连循环。

| File | Role |
|------|------|
| `index.ts` | 入口 — 解析 CLI 参数，创建 ToolRegistry/AgentDirectory，调用 `createAgent()` |
| `agent.ts` | Agent 工厂 — `createAgent()` 构建 StateGraph（agentNode → toolNode → 条件路由），动态系统提示词，JSONL 日志 |
| `tools.ts` | 9 基础工具 + 5 工厂 (spawn/register/unregister/MCP) — `tool()` + Zod v4，通用 CLI 代理无技能适配 |
| `tool-registry.ts` | ToolRegistry — 动态 register/unregister/getActiveTools，支持 LLM 运行时绑定 |
| `agent-directory.ts` | AgentDirectory — A2A 代理间通信（send/broadcast/list/markError） |
| `context.ts` | ContextManager（auto-compress ≥80%/suggest ≥60%/allow ≥40%）+ `createContextTools()` 工厂 |
| `mcp.ts` | MCP client（stdio/HTTP，启动时自动注册 llm-config.json 中配置的 MCP 服务器，支持重连） |
| `llm-config.ts` | LLM 配置加载器（OpenAI 兼容 API） |
| `package.json` | 独立依赖管理 — @langchain/core, @langchain/langgraph, @langchain/openai, openai, zod |
| `task-srs-formalizer.md` | 最小任务提示词（一行），Agent 自行从 SKILL.md 发现流水线 |

Agent 通过 `--task` 文件接收工作提示词，**不硬编码任何技能路径或流程**。系统提示词按模板动态生成，填充当前工具列表、技能目录和项目目录。

**Agent 设计原则**：Agent 是通用命令行任务代理，不应包含任何技能特定适配。所有 CLI 调用通过 `run_command` 完成，LLM 自行从 SKILL.md 学习命令签名。工具集中的 `execSync` 默认 cwd 为 `SKILL_SCRIPTS_DIR`（如有设置），确保命令在正确的技能目录上下文中执行。

**安全约束**：
- 子代理递归深度 ≤3（达到上限自动移除 `spawn_sub_agent` 工具）
- MCP 自动注册可通过 `SKIP_MCP` 环境变量跳过，单服务器超时 5 秒

## Key conventions

- Commit messages in Chinese or English, with `Co-Authored-By: Claude <noreply@anthropic.com>`
- After feature changes: `pack-skill --force` (skill backup), verify 299 tests pass, then commit
- Before claiming completion: run `npx tsx --test __tests__/*.test.ts` and verify 0 failures
- Test LLM config: copy `llm-config.template.json` → `test-llm-config.json` (gitignored)
- `safeParseArg` from `lib/cli.ts` must be used for all CLI argument parsing
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
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **srs-formalizer**: 将 SRS 文档转化为需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约和 Lean 4 证明。当用户提供或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"时使用。
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
<!-- superpowers-zh:end -->
