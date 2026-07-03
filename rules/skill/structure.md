---
alwaysApply: true
---

# Agent Skill 结构与设计模式

> 本规则约束 `.trae/skills/` 下所有 `SKILL.md` 的结构规范与设计模式。

## 来源与适用范围

- **设计模式来源**：Google Cloud Tech / Lavi Nigam《5 Agent Skill Design Patterns Every ADK Developer Should Know》（2026-03-07）。原始链接：https://lavinigam.com/posts/adk-skill-design-patterns/
- **可靠性与编译器来源**：SKCC（Skill Compiler for Cross-framework LLM Agents），中山大学团队（Yipeng Ouyang, Yi Xiao, Yuhao Gu, Xianwei Zhang），ACM CAIS 2026 — AgentSkills'26 Workshop poster。论文：arXiv:2605.03353v4。仓库：https://github.com/Nexa-Language/Skill-Compiler
- **适用范围**：本项目所有 `.trae/skills/` 下 SKILL.md 的设计、审计、改版。新建 skill 必须自检通过本规则全部硬性条款；现有 skill 改版必须重新自检。
- **术语统一**：编译器名称统一为 **SKCC**（论文权威写法，全大写）；中间表示统一为 **SkIR**（仓库代码命名）；设计模式中 "Tool Wrapper" 为正确名称（非"To Wrapper"）。

## 安全现状事实基准（决策依据）

下列数据为强制决策依据，禁止以"我的 skill 简单不会出问题"为由绕过安全审查。

| 事实 | 数据 | 来源 | 决策含义 |
|------|------|------|----------|
| 社区技能漏洞率 | **36.82%**（3,984 skills 中 1,467 含漏洞） | Snyk ToxicSkills 2026-02 | 默认不信任任何外部 skill；引入前必须审计 |
| 恶意载荷占比 | **76 个确认恶意**（凭证窃取、任意命令执行） | Snyk ToxicSkills 2026-02 | 描述字段、不可见 Unicode 字符均为攻击面 |
| 大规模审计验证 | **26.1%**（42,447 skills，64 种漏洞模式） | NVIDIA SkillSpector | 漏洞模式不止一种，需多维度扫描 |
| 格式敏感性波动 | **最高 40% 性能波动** | SKCC 实验数据 | 同一 skill 在不同框架表现差异巨大，必须适配 |
| Claude Code 通过率 | 21.1% → **33.3%**（p=0.0103, d=0.60） | SKCC EX1 | 格式优化对 Claude 显著有效 |
| Kimi CLI 通过率 | 35.1% → **48.7%**（p=0.0063） | SKCC EX1 | 格式优化对 Kimi 统计显著性最强 |
| Codex CLI 通过率 | 38.5% → 42.3%（+3.8 pp） | SKCC EX1 | 格式优化对 Codex 收益有限 |
| Gemini CLI 通过率 | 22.2% → 22.2%（**0 pp**） | SKCC EX1 | Gemini 格式容忍度高，优化空间小——**诚实报告** |
| Anti-Skill 触发率 | **94.8%**（233 skills） | SKCC EX5 | 编译期可拦截近 95% 风险，剩余 5.2% 需运行时兜底 |
| 编译延迟 | **平均 8.93ms**（225 skills） | SKCC EX3 | 编译开销可忽略，禁止以"性能"为由跳过 |
| Token 节省 | **10%~46%** | SKCC EX4 | 编译优化同时降低运行时成本 |
| MCP SDK 月下载量 | **97M+** | Kanopy Labs 2026 | MCP 已是工具调用事实标准 |
| A2A 采纳企业数 | **50+** | Linux Foundation 2026 | A2A 在多 Agent 协作场景广泛应用 |

## SKILL.md 标准结构

```
skill-name/
├── SKILL.md          ← YAML frontmatter + Markdown 指令（必需）
├── references/       ← 风格指南、检查清单、规范集（可选）
├── assets/           ← 模板、输出格式（可选）
└── scripts/          ← 可执行脚本（可选，不进入 token 预算）
```

### 三级渐进式披露（Progressive Disclosure）

skill 的加载分三级，必须按此层级组织内容以控制 token 消耗：

| 级别 | 内容 | Token 量 | 加载时机 |
|------|------|----------|----------|
| L1 Metadata | 仅 skill 名与 description | 约 100 token / skill | 启动时加载全部 skill |
| L2 Instructions | SKILL.md 正文（完整指令） | 上限 5000 token | agent 激活该 skill 时 |
| L3 Resources | `references/`、`assets/` 等外部文件 | 按需 | skill 指令明确要求时 |

> 效果基准：10 个 skill 启动时仅约 1000 token，较一次性全量加载削减约 90%。**严禁**把 L3 资源硬编码进 L2 正文。

### frontmatter 字段定义（强类型契约）

skill 的元数据不只是注释，而是强类型契约——一旦声明，编译期强制校验。

#### 必选字段（缺失即编译失败）

| 字段 | 类型 | 约束 |
|------|------|------|
| `name` | `string` | kebab-case，1-64 字符，禁止连续连字符，必须与父目录名匹配 |
| `description` | `string` | 1-1024 字符，**严禁 XML 标签**（`<` / `>`），必须说明"能做什么"+"何时触发"+"不该何时触发" |
| `metadata.pattern` | `enum` | `tool-wrapper` / `generator` / `reviewer` / `inversion` / `pipeline` 之一，便于检索与组合分析 |

#### 可选字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `version` | `string` | 语义化版本（MAJOR.MINOR.PATCH） |
| `license` | `string` | 许可证声明 |
| `compatibility` | `string` | 环境兼容性说明（≤500 字符） |
| `metadata.domain` | `string` | 领域标签 |
| `metadata.toxic_flow_analysis` | `object` | toxic flow 三要素状态（见 security.md） |
| `allowed-tools` | `string` | 预批准工具列表（空格分隔，实验性） |

#### SkCC 扩展字段（条件必填）

| 字段 | 用途 | 强制条件 |
|------|------|----------|
| `mcp_servers` | MCP 依赖声明 | 使用 MCP 工具时必须声明 |
| `input_schema` / `output_schema` | JSON Schema 接口契约 | skill 接受结构化输入/输出时必须声明 |
| `pre_conditions` / `post_conditions` | 执行前后断言 | `security_level ≥ high` 时必须声明 |
| `fallbacks` | 错误恢复策略 | 涉及不可逆操作时必须声明 |
| `permissions` | 权限声明列表 | 涉及 network / fs / db / exec / mcp 任一权限时必须声明 |
| `security_level` | 安全等级 | 默认 medium，敏感操作必须显式提升 |
| `hitl_required` | 是否强制人工审批 | `security_level ≥ high` 时自动为 true |

#### frontmatter 模板

```yaml
---
name: <skill-name>
description: <何时触发的精炼描述，≤1024 字符，禁 XML 标签>
metadata:
  pattern: tool-wrapper | generator | reviewer | inversion | pipeline
  domain: <可选，领域标签>
  toxic_flow_analysis:
    accesses_private_data: false
    processes_untrusted_input: false
    can_external_communicate: false
# SkCC 扩展字段（按强制条件声明）
security_level: medium
hitl_required: false
permissions: []
---
```

## 五种设计模式

### Pattern 1：Tool Wrapper（工具包装器）

- **解决问题**：系统提示词膨胀、上下文干扰。把全部库规范塞进 system prompt 会让 agent 在无关任务中也被干扰。
- **核心机制**：将特定库 / 框架 / 内部 SDK 的规范打包成 skill，**仅在用户提示命中相关关键词时**才动态加载 `references/conventions.md`，并把规范作为绝对真理应用。
- **目录用法**：只用 `references/`。SKCC.md 监听关键词 → 加载规范文件 → 逐条对照执行。
- **适用场景**：团队编码规范注入、特定 SDK 禁则、API 认证与重试约定、框架最佳实践（如 FastAPI、React、Lean 4）。
- **反模式**：把 API 文档全文写进 SKILL.md 正文（应外置到 `references/`）。

### Pattern 2：Generator（生成器）

- **解决问题**：输出结构飘忽——每次生成的文档结构、术语、语气都不一致。
- **核心机制**：把生成过程变成"填空题"。agent 充当项目经理：加载模板 → 读取风格指南 → 向用户询问缺失变量 → 填充文档。SKILL.md 本身**不含**排版布局或语法规则，只协调资源调取并强制按步执行。
- **目录用法**：`assets/` 放输出模板，`references/` 放风格指南（术语、语气、格式约定）。
- **适用场景**：API 文档、标准化 commit message、技术报告、项目脚手架、ADR 模板。
- **关键约束**：模型"填空"而非自由发挥。

### Pattern 3：Reviewer（审查器）

- **解决问题**：审查标准与审查逻辑耦合，换一套标准就要改整个 skill。
- **核心机制**：硬性拆分"检查什么"（Checklist）与"怎么检查"（skill 逻辑）。审查清单（rubric）外置到 `references/review-checklist.md`，动态加载。**替换清单即可复用同一 skill 基础设施**，从安全审计切换到风格检查无需改核心指令。
- **目录用法**：`references/` 存放可替换的 checklist。
- **输出统一**：所有审查结果必须按四级严重度输出（见 security.md）。
- **适用场景**：代码评审、OWASP 安全审计、TypeScript 严格模式检查、Lean 4 证明风格检查。

### Pattern 4：Inversion（逆向澄清）

- **解决问题**：agent"爱猜"——在信息不足时立即生成输出，导致返工。
- **核心机制**：强制 agent 进入 interview 模式。通过**显式 gating 指令**禁止 agent 在收集完信息前综合输出。流程分阶段：
  1. **Discovery**：确认问题边界
  2. **Constraints**：明确限制（性能、兼容性、范围）
  3. **Synthesis**：信息补齐后才允许综合输出
- **目录用法**：可用 `references/` 存放提问框架模板。
- **适用场景**：需求模糊的功能开发、架构决策、bug 根因分析。
- **与方法论协同**：本模式是 `project/methodology/sop.md` 中"苏格拉底式决策树拷问"在 skill 层的具体实现——单线程聚焦、信息自足、分支穷尽。开发 skill 时若涉及需求澄清，必须采用此模式。
- **效能基准**：来源 FAQ 提及该模式可削减约 68% 的 retry（需在具体 skill 中实测验证，不直接承诺）。

### Pattern 5：Pipeline（流水线）

- **解决问题**：agent 在多步任务中偷懒跳步、遗漏验证。
- **核心机制**：定义顺序工作流，**每步必须完成并通过 gate condition 才能进入下一步**。是最复杂的模式——同时使用全部三个可选目录（`references/` + `assets/` + `scripts/`）。通过状态机、显式门控拦截跳步。
- **目录用法**：`references/` 存阶段规范，`assets/` 存中间产物模板，`scripts/` 存确定性校验脚本（脚本不进入 token 预算，通过 bash 执行）。
- **适用场景**：文档生成流水线、CI/CD 部署、TDD 红-绿-重构循环、formal verification 流程。
- **与方法论协同**：对应 `project/methodology/sop.md` 的 SOP Phase 1–5（拷问循环 → 冻结规格书 → 隔离执行）。开发多步执行类 skill 时采用此模式。
- **与编译器流水线协同**：Pipeline 模式描述的是 skill 内部执行逻辑；下一节的四阶段流水线描述的是 skill 源文件的编译过程——两者层级不同，禁止混淆。

### 模式选择决策表

| 需求特征 | 推荐模式 | 关键信号 |
|----------|----------|----------|
| 注入某库 / 框架的规范知识 | Tool Wrapper | "让 agent 精通 X 库" |
| 生成格式统一的文档 / 报告 | Generator | "每次输出结构必须一致" |
| 按标准对产物打分审查 | Reviewer | "可替换的检查清单" |
| 需求模糊，需先澄清再动手 | Inversion | "agent 先采访我再做事" |
| 多步任务，禁止跳步 | Pipeline | "每步都要验证门控" |

### 模式组合原则

- 五种模式**可组合**。一个复杂 skill 可同时是 Pipeline + Reviewer（流水线某步嵌入审查），或 Inversion + Generator（先澄清再按模板生成）。
- 组合时在 `metadata.pattern` 声明主模式（如 `pipeline`），在 SKILL.md 正文说明嵌套的次模式。
- 组合不应导致 L2 正文超过 5000 token 上限——超出部分必须下沉到 L3 资源。

## 编译器思想：四阶段流水线（设计纲领）

skill 开发不再视为"写一份 Markdown 文件"，而是"编写源代码 → 编译为多目标产物"的工程化过程。

| 阶段 | 输入 | 核心动作 | 输出 | 失败行为 |
|------|------|----------|------|----------|
| **Phase 1: Frontend** | SKILL.md 源文件 | YAML frontmatter 解析 + Markdown AST 构建 + SHA-256 哈希 | RawAST | 格式错误立即 Fail-Fast |
| **Phase 2: IR Construction** | RawAST | 类型映射、字段校验、嵌套数据深度检测 | SkillIR | 类型不匹配立即 Fail-Fast |
| **Phase 3: Analyzer** | SkillIR | SchemaValidator / MCPDependencyChecker / PermissionAuditor / AntiSkillInjector / NestedDataDetector 链式分析 | SkillIR（带约束） | Critical 级诊断必须解决；Warning 级记录但放行 |
| **Phase 4: Backend** | SkillIR（带约束） | 按目标平台格式渲染（Claude XML / Codex 双负载 / Gemini Markdown+YAML / Kimi Full Markdown）+ 协议适配器生成（OpenAI/Claude/Gemini 工具调用格式转换） | 平台特定产物 | 渲染失败立即 Fail-Fast |

**与方法论的协同**：本流水线对应 `project/methodology/sop.md` SOP Phase 4（生成冻结规格书）后的"编译执行"环节。skill 设计文档（PLAN.md）通过拷问后，必须按此四阶段编译产出最终 SKILL.md。

### SkIR 强类型 IR 设计原则

skill 的元数据不只是注释，而是强类型契约。`SkillIR` 包含 20+ 强类型字段，使用 `Arc<str>` 零拷贝优化，关键字段：

- **元数据与路由**：`name` / `version` / `description`
- **接口与 MCP**：`mcp_servers` / `input_schema` / `output_schema`
- **安全与控制**：`hitl_required` / `pre_conditions` / `post_conditions` / `fallbacks` / `permissions` / `security_level`
- **执行逻辑**：`context_gathering` / `procedures` / `few_shot_examples`
- **编译期注入**：`anti_skill_constraints`（由 Analyzer 自动注入）
- **AST 优化标记**：`requires_yaml_optimization` / `nested_data_depth`

### 嵌套数据深度检测

**阈值规则**：当 `input_schema` / `output_schema` 中 Object / Array 嵌套深度 **≥ 3** 时，`NestedDataDetector` 标记 `requires_yaml_optimization: true`，Gemini Backend 必须切换为 YAML 格式输出。

**学术依据**：嵌套数据准确率 YAML **51.9%** > Markdown 48.2% > JSON 43.1% > XML 33.8%。深度 < 3 时格式差异不显著。