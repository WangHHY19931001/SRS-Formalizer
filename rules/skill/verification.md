---
alwaysApply: true
---

# Agent Skill 验证规则

> 本规则约束 `.trae/skills/` 下所有 SKILL.md 的验证标准与局限性说明。

## 技能开发验证规则

技能开发完成后必须通过以下 19 项验证，任一项不通过即禁止合入或发布。验证分为三个层级：编译期自动验证、运行时集成验证、人工审查验证。

### 验证项目清单

| 序号 | 验证项 | 验证层级 | 验证方法 | 失败行为 |
|------|--------|----------|----------|----------|
| 1 | **指令遵从** | 人工审查 | 对照 `SKILL.md` 指令，执行实际任务验证 agent 是否逐条遵循 | 需修改指令或重新训练 |
| 2 | **脚本正确性** | 编译期 + 运行时 | 执行 `scripts/` 下所有脚本，验证返回码、输出格式、异常处理；检查脚本语言仅为 `.ts` / `.tsx`（禁止 `.py` / `.bat` / `.cmd` / `.ps1` / `.sh`）；验证敏感目录访问需 `--confirm-sensitive-access` 参数 | 修复脚本直至全部通过 |
| 3 | **脚本完备性** | 编译期 + 人工审查 | 检查脚本覆盖所有声明的功能点，验证无遗漏的脚本步骤 | 补充缺失脚本或功能 |
| 4 | **状态机正确性** | 编译期 + 运行时 | 遍历所有状态转换，验证每个状态的前置条件、动作、后置条件 | 修复状态定义或转换逻辑 |
| 5 | **状态机完备性** | 编译期 | 检查状态机覆盖所有可能的状态、转换和边界情况，无死锁、无遗漏状态 | 补充缺失状态或转换 |
| 6 | **门限有效性** | 运行时 | 构造边界值输入，验证 gate condition 是否正确拦截/放行 | 调整门限参数或判断逻辑 |
| 7 | **逻辑正确性** | 运行时 + 人工审查 | 覆盖正常路径、异常路径、边界路径，验证输出符合预期 | 修复逻辑缺陷 |
| 8 | **逻辑完备性** | 编译期 + 人工审查 | 检查逻辑覆盖所有业务场景和分支，无逻辑漏洞或未处理情况 | 补充缺失逻辑分支 |
| 9 | **平台适配性** | 编译期 + 运行时 | 在目标框架（Claude / Codex / Gemini / Kimi）分别执行，验证行为一致性；验证跨操作系统兼容性（Windows/macOS/Linux）；验证跨 LLM 协议适配（OpenAI/Claude/Gemini） | 调整格式适配策略 |
| 10 | **阶段复杂度拆分正确性** | 编译期 + 人工审查 | 检查 L2 正文 ≤ 5000 token；若目标整体超 12 万 token 上下文，必须拆解为多个子目标 | 拆分 skill 或下沉资源到 L3 |
| 11 | **指南正确性** | 人工审查 | 验证 `references/` 下指南与实际执行行为一致 | 更新指南或调整执行逻辑 |
| 12 | **技能结构完整性** | 编译期 | 检查 SKILL.md 结构、frontmatter 字段、目录完整性 | 补充缺失项 |
| 13 | **方法论完备性** | 人工审查 | 验证 skill 流程与 `project/methodology/sop.md` SOP 对齐（拷问循环 → 冻结规格书 → 隔离执行） | 补全方法论环节 |
| 14 | **能力可迁移性** | 运行时 | 在不同场景、不同输入下验证 skill 表现，确认核心能力可迁移；验证 A2A 协议兼容性 | 增强通用性设计 |
| 15 | **测试完整性** | 编译期 + 运行时 | 单元测试（函数级）、模块测试（组件级）、集成测试（流程级）、关键逻辑覆盖测试（核心逻辑验证）、全流程黄金测试（端到端基准比对） | 补充缺失测试类型 |
| 16 | **脚本与文本性说明一致性** | 编译期 + 人工审查 | 验证脚本行为与 `SKILL.md`、`references/`、`assets/` 中文本说明一致，无描述与实现不一致 | 修正脚本或文本说明 |
| 17 | **文本性说明内部一致性** | 人工审查 | 检查 `SKILL.md`、`references/`、`assets/` 内部术语、逻辑、步骤的一致性，无矛盾或冲突 | 修正文本性说明 |
| 18 | **文本性说明完备性** | 人工审查 | 验证 `SKILL.md`、`references/`、`assets/` 中文本说明覆盖所有功能点、步骤、异常处理和边界情况，无遗漏信息 | 补充缺失的文本说明 |
| 19 | **脚本可测试性设计** | 编译期 + 人工审查 | 检查脚本设计支持单元测试（函数独立、依赖注入）、可观测性（日志、指标）、可调试性（断点、错误信息）；验证路径处理使用 `path.join()`（禁止字符串拼接），所有路径先获取绝对路径再校验 | 重构脚本以支持测试 |

## Token 预算意识强制规则

**切分大块约束**：当 skill 涉及的目标上下文超过 **12 万 token** 时，必须强制拆解为多个子目标，禁止单一大块执行。

| 上下文规模 | 处理策略 | 验证要求 |
|------------|----------|----------|
| ≤ 5000 token | 单步执行 | L2 正文直接承载 |
| 5000 ~ 120000 token | 分阶段加载 | L3 资源外置，按需加载 |
| > 120000 token | **强制拆解** | 拆分为多个独立 skill，通过 Pipeline 模式串联 |

**验证方法**：编译期计算 `SKILL.md` 正文 + `references/` + `assets/` 全部内容的 token 总量，超过阈值自动告警。

## 测试层级定义

| 层级 | 覆盖范围 | 验证目标 | 通过标准 |
|------|----------|----------|----------|
| **单元测试** | 单个函数/方法 | 逻辑正确性 | 100% 覆盖分支 |
| **模块测试** | 组件/工具类 | 接口正确性 | 所有公开接口验证通过 |
| **集成测试** | 多模块协作流程 | 端到端正确性 | 完整流程无错误 |
| **关键逻辑覆盖测试** | skill 核心业务逻辑 | 核心逻辑正确性 | 所有关键逻辑分支验证通过 |
| **全流程黄金测试** | 完整端到端执行流程 | 一致性保障 | 输出与基准完全一致 |

## 技能开发纪律（强制清单）

新建或改版 skill 时，必须按以下顺序自检，任一项不通过即禁止合入。本清单合并设计模式约束与可靠性约束，按主题分组。

### 模式与结构（来自设计模式）

1. **模式声明**：在 `metadata.pattern` 声明 `tool-wrapper` / `generator` / `reviewer` / `inversion` / `pipeline` 之一。
2. **Pipeline gate condition**：Pipeline 类 skill 每步必须有 gate condition，明确"通过什么校验才能进入下一步"。
3. **Inversion gating 指令**：Inversion 类 skill 必须有显式 gating 指令，禁止在 Discovery / Constraints 阶段就综合输出。
4. **Reviewer 输出分级**：Reviewer 类 skill 必须按 security.md 四级严重度输出（Critical / Error / Warning / Info）。

### 渐进式披露（来自设计模式）

5. **L2 正文 ≤ 5000 token**：超出必须外置到 `references/` 或 `assets/`。
6. **禁止硬编码 L3 内容进 L2**：规范、模板、清单一律外置。

### 字段与权限（来自可靠性）

7. **必选字段**：`name`（kebab-case）+ `description`（≤1024 字符，无 XML 标签，含触发条件）+ `metadata.pattern`。
8. **权限对齐**：Procedures 中每个高危操作都有对应 `permissions` 声明。
9. **MCP 依赖**：使用 MCP 工具时必须声明 `mcp_servers`。

### 安全审查（来自可靠性）

10. **安全等级**：根据操作影响显式声明 `security_level`，禁止默认 `low` 用于敏感操作。
11. **HITL 评估**：高危操作显式声明 `hitl_required: true`，不得依赖运行时判断。
12. **toxic flow 标注**：`metadata.toxic_flow_analysis` 三要素状态必须显式声明。
13. **反模式扫描**：Procedures 不含未约束的 HTTP / 循环 / DB / 解析操作。
14. **Fallback 策略**：涉及不可逆操作时必须声明 `fallbacks`。
15. **断言保护**：`security_level ≥ high` 时必须声明 `pre_conditions` / `post_conditions`。

### 跨环境适配（来自 cross-platform.md）

16. **格式中立**：源 SKILL.md 不含任何框架特定语法（Claude XML / Codex 双负载标记等）。
17. **嵌套深度**：若 `input_schema` / `output_schema` 嵌套 ≥ 3 层，确认目标框架适配策略（Gemini 启用 YAML 优化）。
18. **跨操作系统兼容**：脚本使用 `os.platform()` 检测操作系统，根据平台选择对应的实现；路径处理使用 `path.join()` 和 `os.EOL`；避免硬编码系统命令。
19. **MCP 协议优先**：skill 应优先通过 MCP 协议暴露工具能力，声明 `mcp_servers` 字段；避免直接依赖特定 Agent 框架的工具调用方式。
20. **A2A 协议兼容**：若 skill 需与外部 Agent 协作，对外接口应兼容 A2A Protocol v1.0 规范，包含 Agent Card、Task Object、Message Object 等核心概念。
21. **跨 LLM 协议适配**：工具定义使用标准化的 `input_schema` 格式，参数名禁止以 `-` 开头；支持 OpenAI、Claude、Gemini 三种工具调用协议的自动转换。
22. **格式分层区分**：明确区分"技能内容格式"（由 SKCC Backend 自动渲染，允许 XML）与"工具调用输出格式"（由开发者定义，结构化输出优先 YAML/JSON）。

### 技术选型与路径安全（来自 project/coding/standards.md）

23. **TypeScript 唯一语言**：`scripts/` 目录下仅允许 `.ts` / `.tsx` 文件，禁止 `.py` / `.bat` / `.cmd` / `.ps1` / `.sh` 文件。
24. **绝对路径获取与校验**：所有路径处理必须先通过 `path.resolve()` 或 `path.join()` 获取绝对路径，再进行范围校验和安全检查（禁止 `..` 跳转、符号链接）。
25. **路径拼接规范**：强制使用 `path.join()` 进行路径组合，禁止字符串拼接（`+` / template literal）。
26. **敏感目录访问授权**：访问系统敏感目录时必须添加强制参数 `--confirm-sensitive-access`。

## 与现有规则的协同矩阵

| 场景 | 主导规则 | 协同规则 |
|------|----------|----------|
| 新建 skill 的需求澄清 | project/methodology/sop.md（拷问循环） | structure.md Pattern 4 Inversion |
| skill 逻辑组织 | structure.md（5 种模式） | structure.md（必选字段约束） |
| skill 安全审查 | security.md（Anti-Skill + 安全等级） | project/rules.md（安全规范） |
| skill 跨环境适配 | cross-platform.md（OS层 + 协议层 + LLM层） | structure.md（四阶段流水线） |
| skill 改版审计 | security.md（Fail-Fast 清单） + verification.md（自检清单） | superpowers-zh.md（verification-before-completion） |
| skill 审查输出分级 | security.md（四级严重度） | chinese-code-review skill（话术分级对齐） |
| skill 验证执行 | verification.md（验证规则） | project/coding/testing.md（测试规范） |

## 局限性认知（避免过度承诺）

引用 SKCC 数据时必须同时告知局限性，禁止选择性引用利好数据：

1. **Gemini 平台增益为 0**：SKCC 的优化效果严格模型依赖，不是"一键通杀"。本项目若主用 Gemini，不应期待通过率提升。
2. **5.2% 安全风险未拦截**：Anti-Skill 触发率 94.8% 意味着仍有约 5.2% 风险需运行时兜底，禁止以"编译期已防护"为由关闭运行时监控。
3. **覆盖边界**：Anti-Skill 主要覆盖 HTTP / 循环 / DB / 解析四类，对组合型风险（如 SkillReact 论文指出的"单独安全技能组合后产生风险"）覆盖不足，复杂 skill 需额外人工审计。
4. **生态成熟度**：SkCC 解决格式适配，但部署路径碎片化（`.claude/skills/` / `.github/skills/` 等）仍需生态协同。本项目统一使用 `.trae/skills/` 路径。
5. **Inversion 模式 68% retry 削减**：来源 FAQ 提及，但需在具体 skill 中实测验证，不直接承诺。
6. **MCP/A2A 互补而非替代**：MCP 负责工具调用，A2A 负责 Agent 协作，两者缺一不可。禁止认为"选一个就够了"。
7. **格式分层必须区分**：技能内容格式（SKCC Backend 自动渲染）与工具调用输出格式（开发者定义）是两个独立维度，禁止混淆。