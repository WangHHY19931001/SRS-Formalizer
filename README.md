# SRS-Formalizer

将 SRS（软件需求规格说明）文档转化为四类形式化产出的 AI Agent 技能：
**需求知识图谱**（Cypher）· **BDD 测试骨架**（Gherkin）· **TLA+ 规约** · **Lean 4 证明**

## 快速开始

```bash
# 安装依赖
cd .claude/skills/srs-formalizer/scripts && npm install

# 初始化工作目录
npx tsx index.ts init --output .srs_formalizer

# 索引化分片（支持 .md / .html / 多目录包）
npx tsx index.ts manifest --src <srs-file-or-dir> --lang zh --workdir .srs_formalizer

# 编译技能（v0.4.0+，安全注入 + 平台发射）
npx tsx index.ts compile --skill-dir .claude/skills/srs-formalizer --workdir .srs_formalizer

# 运行测试
npm test
```

## 流水线架构

```
S0(发现确认) → S1(索引化分片) → S2(需求提取+架构7子阶段) → S3(图谱构建)
→ S4(BDD生成) → S5(形式化/条件触发) → S6(验收闸门)
```

| 阶段 | 输入 | 产出 |
|------|------|------|
| **S0** Discovery | SRS 文档 | 分析报告 + TLA+/Lean 触发判定 |
| **S1** Preprocess | 原始 SRS | `shard_index.json`（索引化分片）+ `GLOSSARY.md`（术语表） |
| **S2** Extract | 分片索引 | R1 显式/R2 隐式/R3 关系需求 JSONL + 架构 JSONL |
| **S3** Graph | 需求 JSONL | 知识图谱 → Cypher 导出 |
| **S4** BDD | 图谱 | `.feature` 文件 + `behavior-graph.json`（行为图谱） |
| **S5** Formal | 图谱 + 触发条件 | TLA+ `.tla` / Lean `.lean` + 交互图谱 / 证明依赖图谱（条件触发） |
| **S6** Gate | 全阶段产物 | 系统架构图谱 + 一致性报告 + 收敛日志 + 交付物清单 |

## 27 个 CLI 命令（23 个流水线 + 4 个维护）

| 命令 | 阶段 | 功能 |
|------|:----:|------|
| `init` | S1 | 初始化 `.srs_formalizer/` 工作目录 |
| `manifest` | S1 | SRS 索引化分片 + 章节识别 + 缺口检测 |
| _(子代理)_ | S1 | 并行分批复用 shards 提取术语 → `GLOSSARY.md` |
| `validate-glossary` | S1 | 术语表批次 JSON 校验（8 项 + 门禁 ≥5 高置信度） |
| `compile` | 加载时 | 编译 SKILL.md → SkIR + Anti-Skill 注入 + 平台发射 |
| `inject-prompt` | S2 | 模板参数注入（支持 `--shard-id` 自动解析） |
| `validate-jsonl` | S2 | JSONL 6 项格式校验 |
| `validate-architecture` | S2 | 架构 JSONL 6 项校验 + 循环检测 |
| `build-graph` | S3 | JSONL → 需求知识图谱 |
| `build-architecture` | S3 | 架构 JSONL → 架构图节点 |
| `analyze-structure` | S3 | 孤立/悬挂/孤岛检测 |
| `merge-structure` | S3 | 结构补全合并 |
| `analyze-graph` | S3 | Jaccard 去重 + 反义检测 + 同对象聚类 |
| `merge-analysis` | S3 | 语义判定合并 |
| `export-cypher` | S3 | 图谱 → Neo4j Cypher 脚本 |
| `validate-cypher` | S3 | Cypher 脚本 4 项校验 |
| `generate-bdd` | S4 | 图谱 → Gherkin BDD 骨架 |
| `validate-bdd` | S4 | Gherkin 格式校验 |
| `build-behavior-graph` | S4 | BDD → 系统行为图谱 JSON + Cypher |
| `build-tla-graph` | S5 | TLA+ → 系统交互图谱（System/Actor/Action/Invariant） |
| `build-lean-graph` | S5 | Lean 4 → 证明依赖图谱（Theorem/Lemma/Import） |
| `build-system-architecture` | S6 | 四层合成 → 系统架构图谱 + 一致性报告 + 收敛循环 |
| `query-graph` | S6 | 图谱只读查询（7 种） |
| `verify-gate` | S1/S3/S6 | 三级硬门禁检查（含全部图谱存在性 + 收敛状态） |
| `capability-probe` | S0 | LLM 能力探测（8 维度 × 50 题，含 TLA+/Lean 4 工具链验证） |

## 安装技能

```bash
# 项目级安装
cp -r .claude/skills/srs-formalizer /your-project/.claude/skills/

# 或从 zip 分发
unzip srs-formalizer-v0.5.1.zip -d /your-project/
```

## 技术栈

- **TypeScript 5.5+**（strict 模式）
- **Node.js ≥20**（ESM）
- **零外部 npm 依赖**（仅 `typescript` + `@types/node`，技能包；agent 独立管理依赖）
- **测试**：Node.js 原生 `node:test` + `node:assert`（299 用例）
- **Agent 框架**：LangGraph 1.4+（StateGraph ReAct 模式）+ LangChain Core 1.2+ + Zod v4

## 版本历史

| 版本 | 日期 | 关键变更 |
|------|------|---------|
| **0.5.1** | 2026-07-02 | 50-probe 重写、TLA+/Lean 编码指南、递归分片(≤200行)、术语表并行提取、五层图谱体系、CLI 毒值防护、S6 收敛循环 |
| **0.5.0** | 2026-07-01 | 分片索引化重构——`ShardEntry.locator` 格式 `{file_abspath}-{start}-{end}-{chunk_id}`，移除 `1_shard/` 目录，HTML 格式保留，`inject-prompt --shard-id` 自动解析 |
| **0.4.0** | 2026-07-01 | SkCC 方法论集成——`compile` 命令、SkIR 中间表示、Anti-Skill 安全注入（7 条规则）、Claude XML + Generic MD 双发射器 |
| **0.3.0** | 2026-06-30 | 分片源位置标注、安全 ID（ASCII-only）、目录结构重构（阶段前缀） |
| **0.2.0** | 2026-06-30 | S2 阶段：inject-prompt、validate-jsonl、executor/verifier 提示词 |
| **0.1.0** | 2026-06-30 | S1 基础设施：init、manifest、类型定义、安全库 |

## 端到端使用示例引导

完整演示请参考 [examples/end-to-end-walkthrough.md](examples/end-to-end-walkthrough.md)。

该引导通过一个真实的中文 SRS 文档（电商订单系统），完整走通 **S0 发现确认 → S1 预处理 → S2 需求提取 → S3 图谱构建 → S4 BDD 生成 → S5 形式化 → S6 验收闸门** 全流程，展示每个阶段的输入、执行命令和产出物格式。

## Golden 标准参考

`tests/golden/` 目录存放各阶段的 **L4 验收用例**（Golden 标准），作为人工验收的断言基线。每个文件定义一组场景（输入 → 执行 → 验收断言），用于验证阶段产物的完整性和正确性。

| 文件 | 阶段 | 描述 |
|------|:----:|------|
| `s1-preprocess.md` | S1 | **预处理验收**：中文 SRS 单文件分片 + 缺口报告、确定性与幂等性、路径安全拒绝、参数缺失拒绝 |
| `s2-extraction.md` | S2 | **需求提取验收**：R1 显式 / R2 隐式 / R3 关系需求提取、校验者编造数据拒绝、模板注入防护 |
| `s4-bdd.md` | S4 | **BDD 验收**：从图谱生成 Gherkin 骨架、`<THEN_PLACEHOLDER>` 检测、确定性校验、空图谱处理 |

## 目录参考

### `references/`（参考文档）

技能运行时的子代理参考指南，按阶段按需加载。

| 文件 | 阶段 | 用途 |
|------|:----:|------|
| `srs-chapter-guide.md` | S1 | SRS 章节识别规范——标准章节编号模式 |
| `hooks-integration.md` | 安装 | 多平台激活适配参考（Claude Code / Cursor / 手动） |
| `auto-setup.md` | 安装 | 编码智能体自动适配自配置指南 |
| `agent-integration-guide.md` | 安装 | Agent 多平台集成差异参考（Cline / Roo Code / GenAI / ...） |
| `capability-adaptation.md` | S0 | LLM 能力分级适配方案——根据能力探测结果调整行为 |
| `tlaplus-coding-guide.md` | S5 | TLA+ 编码指南（S5 TLA+ 触发时加载给子代理） |
| `lean4-coding-guide.md` | S5 | Lean 4 编码指南（S5 Lean 证明触发时加载给子代理） |

### `templates/`（产出模板）

| 文件 / 目录 | 用途 |
|-------------|------|
| `STATE.md.template` | SRS Formalizer 状态追踪模板 |
| `CONTEXT.md.template` | SRS 术语表与切片索引模板 |
| `GAPS.md.template` | 信息缺口追踪模板 |
| `MINDMAP.md.template` | SRS 结构总览模板 |
| `BEHAVIORS.md.template` | BDD 分层建模索引模板 |
| `SPECS.md.template` | TLA+ 规约索引模板 |
| `PROOFS.md.template` | Lean 4 证明索引模板 |
| `RESEARCH_LOG.md.template` | 深度研究日志模板 |
| `checklists/` | 7 份阶段验收 CHECKLIST（S0 发现 → S6 验收闸门），`init` 时按阶段复制到 `.srs_formalizer/` |

## S5 形式化质量保障

S5（形式化）阶段在触发条件满足时自动启用，依赖 **确定性工具链** 对生成的 TLA+ 规约和 Lean 4 证明进行机械性检查，而非依赖 LLM 评审。

| 机制 | 工具 | 作用 |
|------|------|------|
| **TLA+ 模型检测** | SANY 解析器 + TLC 模型检测器 | 解析 TLA+ 规约语法，运行模型检测验证不变量和活性 |
| **Lean 4 证明验证** | `lake build`（Lean 构建系统） | 编译 Lean 证明文件，验证定理证明的正确性 |
| **能力探测** | `capability-probe` CLI 命令 | S0 阶段出题判分（8 维度 50 题），判断当前 LLM 是否具备 TLA+/Lean 所需的推理能力，避免因能力不足导致无效形式化 |
| **错误诊断** | `prompts/debug-tlc.md`、`prompts/debug-lean.md` | 子代理读取工具错误输出进行诊断修复 |

**工作流**：S0 阶段通过 `capability-probe` 探测 LLM 在 `logical_reasoning`、`state_machine_modeling`、`theorem_proving` 等维度的能力分数；S5 阶段由子代理生成 `.tla` / `.lean` 文件后，编排者调用 SANY/TLC 或 `lake build` 进行编译验证，不通过则进入 `systematic-debugging` 循环修复。

## 目录结构

```
.claude/skills/srs-formalizer/
├── SKILL.md              # 技能定义
├── CHANGELOG.md          # 版本变更
├── scripts/              # TypeScript 工具链
│   ├── index.ts          # CLI 入口
│   ├── commands/         # 27 个命令（含维护命令）
│   ├── lib/              # 库模块（graph, jsonl, bdd, anti-skill, emitters...）
│   ├── types/            # 类型定义（JsonlRecord, ShardEntry, SkIR...）
│   └── __tests__/        # 255 个测试
├── prompts/              # LLM 提示词（编排者 + 执行者 + 校验者）
├── references/           # 参考文档
├── templates/            # 产出模板 + CHECKLIST
└── tests/                # 验收用例 + Golden 文件
```

## 致谢

| 项目 | 说明 |
|------|------|
| **Superpowers-ZH** ([github.com/jnMetaCode/superpowers-zh](https://github.com/jnMetaCode/superpowers-zh)) | 本项目的 20 个 Superpowers 技能包（brainstorming、writing-plans、systematic-debugging、verification-before-completion 等）加速了 srs-formalizer 的设计流程、代码审阅和开发迭代，特此致谢 |
| **Trae CN + GLM 5.2** | 本技能需求文档使用 Trae CN + GLM 5.2 辅助编写 |
| **Claude Code + DeepSeek V4** | 本技能实际开发使用 Claude Code + DeepSeek V4 进行开发 |
| **grill-me / grill-with-docs** | 本技能部分方法论参考了 grill-me 和 grill-with-docs |
| **SkCC 论文与实现** | 本技能参考了中山大学团队 SkCC 论文 (arXiv:2605.03353) 及 Nexa-Language/Skill-Compiler 开源实现 |
| **LangChain.js** ([github.com/langchain-ai/langchainjs](https://github.com/langchain-ai/langchainjs)) | Agent 框架核心——提供 Zod schema 工具定义（`tool()`）、消息系统及 LangChain Core 运行时基础 |
| **LangGraph.js** ([github.com/langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs)) | Agent 运行时引擎——StateGraph ReAct 循环、ToolNode 工具执行、条件路由及递归控制 |
| **LangChain (Python)** ([github.com/langchain-ai/langchain](https://github.com/langchain-ai/langchain)) | 生态系统的 Python 实现（~140k stars），供 Agent 联网搜索查阅技术文档 |
| **LangGraph (Python)** ([github.com/langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)) | Python 版图 Agent 框架（~35.7k stars），设计参考及跨语言概念对齐 |

## 技能调测

项目根目录 `agent/` 包含 **LLM 驱动的调测代理**，可完整测试技能的指令遵从、脚本正确性、状态机和门限。

调测代理独立于技能本身，使用 LangGraph StateGraph（ReAct 模式）动态读取 SKILL.md、执行命令、验证产物，所有操作通过 JSONL 日志记录。代理**不硬编码任何技能路径或流程**——全部通过 `--task` 工作提示词动态配置，可调测任意技能。

### 配置

```bash
cp llm-config.template.json test-llm-config.json
# 编辑 test-llm-config.json，填入 OpenAI 兼容的 LLM 服务
```

### 运行

```bash
# 安装 agent 依赖
cd agent && npm install

# 运行调测
npx tsx agent/index.ts --llm-config test-llm-config.json --task agent/task-srs-formalizer.md
```

### 工作原理

代理通过 `--task` 文件接收最小工作提示词（如"使用 xxx 技能，基于 xxx 路径的 SRS 文档工作"），然后：
1. 读取 SKILL.md 了解技能结构和流水线阶段
2. 按阶段使用工具执行命令、验证产物
3. 通过 `spawn_sub_agent` 递归分派子代理处理 LLM 任务
4. 动态系统提示词在每轮注入当前工具列表、技能目录和项目目录
5. JSONL 日志记录每一步操作（位于 `--log-dir` 指定目录）

### CLI 参数

| 参数 | 必需 | 说明 |
|------|:----:|------|
| `--llm-config <path>` | ✅ | LLM 配置文件路径 |
| `--task <path>` | * | 任务提示词文件（推荐） |
| `--task-prompt "..."` | * | 直接传入任务提示词 |
| `--skills-dir <path>` | | skills 目录（默认: `.claude/skills`） |
| `--project-root <path>` | | 项目根目录（默认: CWD） |
| `--work-dir <path>` | | 工作目录（默认: `/tmp/srs-debug-<ts>/.srs_formalizer`） |
| `--log-dir <path>` | | 日志目录（默认: `/tmp/srs-agent-traces`） |

### 架构

```
agent/
├── index.ts              # 入口（--llm-config + --task，ToolRegistry + AgentDirectory）
├── agent.ts              # LangGraph StateGraph ReAct 循环 + 动态系统提示词
├── tools.ts              # 12 LangChain 工具（tool() + Zod v4）
├── tool-registry.ts      # 动态工具注册/卸载（register/unregister/getActiveTools）
├── agent-directory.ts    # A2A 代理目录（send/broadcast/list/markError）
├── context.ts            # ContextManager（getInfo + createContextTools）
├── llm-config.ts         # LLM 配置加载器
├── mcp.ts                # MCP 客户端（stdio/HTTP）
├── package.json          # LangGraph + LangChain + openai + zod 依赖
├── tsconfig.json         # Strict TypeScript 配置
└── task-srs-formalizer.md  # 最小任务提示词（一行，代理自行发现流水线）
```

### 工具列表

| 工具 | 说明 |
|------|------|
| `read_file` | 读取文件内容 |
| `write_file` | 创建或覆盖写入文件 |
| `edit_file` | 精确字符串替换 |
| `search_in_file` | 关键字/正则搜索 |
| `run_command` | Shell 命令执行（捕获 stdout + stderr） |
| `web_search` | 联网搜索（DuckDuckGo，无需 API key） |
| `http_request` | HTTP GET/POST 请求 |
| `list_directory` | 列出目录内容 |
| `check_file_exists` | 检查文件/目录是否存在 |
| `validate_output` | 校验流水线产物格式 |
| `spawn_sub_agent` | 递归分派子代理 |
| `context_info` | 查询上下文使用率 |
| `compress_context` | 请求压缩上下文 |
| `complete_task` | 任务完成信号 |

## 许可

本项目采用 [MIT 协议](LICENSE) 开源。

## 参考

- **SkCC 论文**: [arXiv:2605.03353](https://arxiv.org/abs/2605.03353) — 编译方法论基础
- **SkCC 源码**: [github.com/Nexa-Language/Skill-Compiler](https://github.com/Nexa-Language/Skill-Compiler)
- **SkillsBench**: [arXiv:2602.12670](https://arxiv.org/abs/2602.12670) — Agent 技能基准
- **Agent Skills 规范**: [agentskills.io](https://agentskills.io/)
