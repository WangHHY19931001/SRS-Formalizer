---
alwaysApply: true
---

# Agent Skill 设计与可靠性规则

> 本规则约束 `.trae/skills/` 下所有 `SKILL.md` 的设计、可靠性、安全与跨环境适配。**格式正确 ≠ 安全可靠**——必须同时满足：内容逻辑组织（设计模式）+ 编译期校验（强类型 IR）+ 安全约束注入（Anti-Skill）+ 跨环境适配（多目标 Backend）四重把关。
>
> **与外部规则的协同**：
> - 与 [methodology.md](./methodology.md) 协同：本规则是"事实交叉验证"层在 skill 开发中的具体落地——基于 Snyk/NVIDIA 审计事实与 SKCC 实验数据，不依赖主观判断。
> - 与 [project_rules.md](./project_rules.md) 协同：本规则的安全等级高于项目一般代码规范，对 High/Critical 级 skill 强制 HITL。

## 来源与适用范围

- **设计模式来源**：Google Cloud Tech / Lavi Nigam《5 Agent Skill Design Patterns Every ADK Developer Should Know》（2026-03-07）。原始链接：https://lavinigam.com/posts/adk-skill-design-patterns/
- **可靠性与编译器来源**：SKCC（Skill Compiler for Cross-framework LLM Agents），中山大学团队（Yipeng Ouyang, Yi Xiao, Yuhao Gu, Xianwei Zhang），ACM CAIS 2026 — AgentSkills'26 Workshop poster。论文：arXiv:2605.03353v4。仓库：https://github.com/Nexa-Language/Skill-Compiler
- **安全事实来源**：Snyk ToxicSkills 审计（2026-02，3,984 skills，36.82% 含漏洞，76 个恶意载荷）；NVIDIA SkillSpector 审计（42,447 skills，26.1% 含漏洞，64 种漏洞模式）。
- **协议事实来源**：MCP（Anthropic 2024）、A2A（Google/Linux Foundation 2025）、AIP（中国国标 2026）、SkCC（中山大学 2026）。
- **适用范围**：本项目所有 `.trae/skills/` 下 SKILL.md 的设计、审计、改版。新建 skill 必须自检通过本规则全部硬性条款；现有 skill 改版必须重新自检。
- **术语统一**：编译器名称统一为 **SKCC**（论文权威写法，全大写）；中间表示统一为 **SkIR**（仓库代码命名）；设计模式中 "Tool Wrapper" 为正确名称（非"To Wrapper"）。

## 一、安全现状事实基准（决策依据）

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

## 二、SKILL.md 标准结构

```
skill-name/
├── SKILL.md          ← YAML frontmatter + Markdown 指令（必需）
├── references/       ← 风格指南、检查清单、规范集（可选）
├── assets/           ← 模板、输出格式（可选）
└── scripts/          ← 可执行脚本（可选，不进入 token 预算）
```

### 2.1 三级渐进式披露（Progressive Disclosure）

skill 的加载分三级，必须按此层级组织内容以控制 token 消耗：

| 级别 | 内容 | Token 量 | 加载时机 |
|------|------|----------|----------|
| L1 Metadata | 仅 skill 名与 description | 约 100 token / skill | 启动时加载全部 skill |
| L2 Instructions | SKILL.md 正文（完整指令） | 上限 5000 token | agent 激活该 skill 时 |
| L3 Resources | `references/`、`assets/` 等外部文件 | 按需 | skill 指令明确要求时 |

> 效果基准：10 个 skill 启动时仅约 1000 token，较一次性全量加载削减约 90%。**严禁**把 L3 资源硬编码进 L2 正文。

### 2.2 frontmatter 字段定义（强类型契约）

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
| `metadata.toxic_flow_analysis` | `object` | toxic flow 三要素状态（见 §6.3） |
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

## 三、五种设计模式

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
- **输出统一**：所有审查结果必须按四级严重度输出（见 §7）。
- **适用场景**：代码评审、OWASP 安全审计、TypeScript 严格模式检查、Lean 4 证明风格检查。

### Pattern 4：Inversion（逆向澄清）

- **解决问题**：agent"爱猜"——在信息不足时立即生成输出，导致返工。
- **核心机制**：强制 agent 进入 interview 模式。通过**显式 gating 指令**禁止 agent 在收集完信息前综合输出。流程分阶段：
  1. **Discovery**：确认问题边界
  2. **Constraints**：明确限制（性能、兼容性、范围）
  3. **Synthesis**：信息补齐后才允许综合输出
- **目录用法**：可用 `references/` 存放提问框架模板。
- **适用场景**：需求模糊的功能开发、架构决策、bug 根因分析。
- **与方法论协同**：本模式是 `methodology.md` 中"苏格拉底式决策树拷问"在 skill 层的具体实现——单线程聚焦、信息自足、分支穷尽。开发 skill 时若涉及需求澄清，必须采用此模式。
- **效能基准**：来源 FAQ 提及该模式可削减约 68% 的 retry（需在具体 skill 中实测验证，不直接承诺）。

### Pattern 5：Pipeline（流水线）

- **解决问题**：agent 在多步任务中偷懒跳步、遗漏验证。
- **核心机制**：定义顺序工作流，**每步必须完成并通过 gate condition 才能进入下一步**。是最复杂的模式——同时使用全部三个可选目录（`references/` + `assets/` + `scripts/`）。通过状态机、显式门控拦截跳步。
- **目录用法**：`references/` 存阶段规范，`assets/` 存中间产物模板，`scripts/` 存确定性校验脚本（脚本不进入 token 预算，通过 bash 执行）。
- **适用场景**：文档生成流水线、CI/CD 部署、TDD 红-绿-重构循环、formal verification 流程。
- **与方法论协同**：对应 `methodology.md` 的 SOP Phase 1–5（拷问循环 → 冻结规格书 → 隔离执行）。开发多步执行类 skill 时采用此模式。
- **与编译器流水线协同**：Pipeline 模式描述的是 skill 内部执行逻辑；§4 的四阶段流水线描述的是 skill 源文件的编译过程——两者层级不同，禁止混淆。

### 3.1 模式选择决策表

| 需求特征 | 推荐模式 | 关键信号 |
|----------|----------|----------|
| 注入某库 / 框架的规范知识 | Tool Wrapper | "让 agent 精通 X 库" |
| 生成格式统一的文档 / 报告 | Generator | "每次输出结构必须一致" |
| 按标准对产物打分审查 | Reviewer | "可替换的检查清单" |
| 需求模糊，需先澄清再动手 | Inversion | "agent 先采访我再做事" |
| 多步任务，禁止跳步 | Pipeline | "每步都要验证门控" |

### 3.2 模式组合原则

- 五种模式**可组合**。一个复杂 skill 可同时是 Pipeline + Reviewer（流水线某步嵌入审查），或 Inversion + Generator（先澄清再按模板生成）。
- 组合时在 `metadata.pattern` 声明主模式（如 `pipeline`），在 SKILL.md 正文说明嵌套的次模式。
- 组合不应导致 L2 正文超过 5000 token 上限——超出部分必须下沉到 L3 资源。

## 四、编译器思想：四阶段流水线（设计纲领）

skill 开发不再视为"写一份 Markdown 文件"，而是"编写源代码 → 编译为多目标产物"的工程化过程。

| 阶段 | 输入 | 核心动作 | 输出 | 失败行为 |
|------|------|----------|------|----------|
| **Phase 1: Frontend** | SKILL.md 源文件 | YAML frontmatter 解析 + Markdown AST 构建 + SHA-256 哈希 | RawAST | 格式错误立即 Fail-Fast |
| **Phase 2: IR Construction** | RawAST | 类型映射、字段校验、嵌套数据深度检测 | SkillIR | 类型不匹配立即 Fail-Fast |
| **Phase 3: Analyzer** | SkillIR | SchemaValidator / MCPDependencyChecker / PermissionAuditor / AntiSkillInjector / NestedDataDetector 链式分析 | SkillIR（带约束） | Critical 级诊断必须解决；Warning 级记录但放行 |
| **Phase 4: Backend** | SkillIR（带约束） | 按目标平台格式渲染（Claude XML / Codex 双负载 / Gemini Markdown+YAML / Kimi Full Markdown）+ 协议适配器生成（OpenAI/Claude/Gemini 工具调用格式转换） | 平台特定产物 | 渲染失败立即 Fail-Fast |

**与 methodology.md 的协同**：本流水线对应方法论 SOP Phase 4（生成冻结规格书）后的"编译执行"环节。skill 设计文档（PLAN.md）通过拷问后，必须按此四阶段编译产出最终 SKILL.md。

### 4.1 SkIR 强类型 IR 设计原则

skill 的元数据不只是注释，而是强类型契约。`SkillIR` 包含 20+ 强类型字段，使用 `Arc<str>` 零拷贝优化，关键字段：

- **元数据与路由**：`name` / `version` / `description`
- **接口与 MCP**：`mcp_servers` / `input_schema` / `output_schema`
- **安全与控制**：`hitl_required` / `pre_conditions` / `post_conditions` / `fallbacks` / `permissions` / `security_level`
- **执行逻辑**：`context_gathering` / `procedures` / `few_shot_examples`
- **编译期注入**：`anti_skill_constraints`（由 Analyzer 自动注入）
- **AST 优化标记**：`requires_yaml_optimization` / `nested_data_depth`

### 4.2 嵌套数据深度检测

**阈值规则**：当 `input_schema` / `output_schema` 中 Object / Array 嵌套深度 **≥ 3** 时，`NestedDataDetector` 标记 `requires_yaml_optimization: true`，Gemini Backend 必须切换为 YAML 格式输出。

**学术依据**：嵌套数据准确率 YAML **51.9%** > Markdown 48.2% > JSON 43.1% > XML 33.8%。深度 < 3 时格式差异不显著。

## 五、跨环境适配策略

skill 必须在三个维度实现跨环境兼容：**操作系统层**（Windows/macOS/Linux）、**Agent 协议层**（MCP/A2A）、**LLM 调用层**（OpenAI/Claude/Gemini）。这三个维度正交且互补，必须分别处理。

### 5.1 跨操作系统适配（OS 层）

#### 5.1.1 输入事件注入抽象层

三大平台的输入事件注入机制差异显著，必须通过统一抽象层屏蔽底层细节：

| 平台 | API 类型 | 权限要求 | 事件可见性 |
|------|----------|----------|------------|
| **Windows** | SendInput (user32.dll) | 无特殊权限 | 注入至前台进程输入队列 |
| **macOS** | CGEventPost (CoreGraphics) | 辅助功能授权 | 全局捕获链中生效 |
| **Linux** | uinput kernel module | root 或 uinput 组权限 | 内核态虚拟设备，完全透明 |

**设计原则**：脚本必须使用 `os.platform()` 检测当前操作系统，动态选择对应的输入事件实现。

#### 5.1.2 GUI 元素识别技术栈

跨平台 GUI 自动化依赖各平台的 Accessibility API：

| 平台 | 主接口 | 典型调用方式 |
|------|--------|--------------|
| **Windows** | UI Automation | COM IDispatch + IUIAutomationElement |
| **macOS** | AX API | NSAccessibility protocol + AXUIElementRef |
| **Linux** | AT-SPI2 | D-Bus over org.a11y.atspi.\* interfaces |

**约束条件**：
- 需启用系统级辅助功能开关（Windows"讲述人"、macOS"旁白"、GNOME"屏幕阅读器"）
- macOS 需在"隐私与安全性→辅助功能"中授权应用
- Windows 如需访问更高 IL（完整性级别）的进程，需设置 UIAccess 标志并以管理员身份运行

#### 5.1.3 窗口控制抽象

将 `HWND`（Windows）、`NSWindow*`（macOS）和 `X11 Window ID` 统一封装为不可变的 `WindowID` 类型：

```typescript
type Platform = 'win32' | 'darwin' | 'linux';

interface WindowID {
  platform: Platform;
  handle: number | bigint;
}
```

#### 5.1.4 路径与环境差异

| 差异类别 | Windows | macOS | Linux |
|----------|---------|-------|-------|
| 路径分隔符 | `\` | `/` | `/` |
| 行尾符 | `\r\n` | `\n` | `\n` |
| 外壳 | PowerShell / cmd | zsh / bash | bash / sh |
| 环境变量 | `%VAR%` | `$VAR` | `$VAR` |

**强制规则**：
- 使用 `path.join()` 而非字符串拼接构建路径
- 使用 `os.EOL` 处理行尾符
- 使用 `process.env` 读取环境变量
- 避免硬编码系统命令（如 `ls`、`dir`），改用 Node.js 内置模块

### 5.2 跨 Agent 协议适配（协议层）

#### 5.2.1 MCP 与 A2A 的互补关系

MCP（Model Context Protocol）和 A2A（Agent-to-Agent Protocol）服务于完全不同的层次，**互补而非竞争**：

| 协议 | 职责 | 交互对象 | 状态性 | 典型场景 |
|------|------|----------|--------|----------|
| **MCP** | agent→工具/数据 | 工具、API、数据库 | 通常无状态 | 查询数据库、调用 API、读写文件 |
| **A2A** | agent→agent | 其他 Agent | 有状态 | 任务委派、协作对话、结果汇总 |

**架构定位**：
```
┌──────────────────────────────────────────────────────────┐
│                    Agent Network Layer                   │
│  ┌──────────┐    A2A协议    ┌──────────┐    A2A协议    ┐│
│  │ Agent A  │ ←────────────→ │ Agent B  │ ←────────────→ ││
│  └────┬─────┘                └────┬─────┘                ││
│       │                           │                       ││
│       │ MCP协议                   │ MCP协议               ││
│       ▼                           ▼                       ││
│  ┌──────────┐                ┌──────────┐                ││
│  │ Tools    │                │ Tools    │                ││
│  │ Database │                │ API      │                ││
│  │ Files    │                │ etc.     │                ││
│  └──────────┘                └──────────┘                ││
└──────────────────────────────────────────────────────────┘
```

#### 5.2.2 MCP（Model Context Protocol）

MCP 是 Anthropic 发起的工具调用标准协议，已成为 Agent 工具调用的事实标准（月下载量 97M+）。

**核心接口**：
- `tools/list`：获取工具列表
- `tools/call`：调用工具
- `system/health`：健康检查

**设计原则**：skill 应优先通过 MCP 协议暴露工具能力，声明 `mcp_servers` 字段；避免直接依赖特定 Agent 框架的工具调用方式。

**MCP Server 实现示例**（TypeScript）：

```typescript
import { McpServer, Tool } from '@modelcontextprotocol/sdk';

const tools: Tool[] = [
  {
    name: 'query_database',
    description: '查询数据库',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL 查询语句' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const { query } = args as { query: string };
      return await executeQuery(query);
    },
  },
];

const server = new McpServer({ tools });
server.listen(8000);
```

#### 5.2.3 A2A Protocol v1.0

A2A 是 Linux Foundation 托管的生产就绪标准，支持异构 Agent 之间的互操作（50+ 企业采纳）。

**核心概念**：

| 概念 | 用途 | 关键特性 |
|------|------|----------|
| **Agent Card** | 代理发现与身份验证 | 支持签名验证，包含能力声明 |
| **Task Object** | 任务描述与状态管理 | 支持多协议绑定、版本协商 |
| **Message Object** | 结构化消息交换 | 支持文本、文件、数据等多种内容类型 |
| **Artifact Object** | 产物传递与追踪 | 支持流式传输、加密签名 |

**传输协议**：HTTP + JSON-RPC 2.0 + Server-Sent Events（SSE）

**设计原则**：若 skill 需与外部 Agent 协作，对外接口应兼容 A2A 协议规范，便于与其他 Agent 协作。

#### 5.2.4 多 Agent 协作模式

| 模式 | 场景 | 实现方式 |
|------|------|----------|
| **任务委派** | 将子任务分配给专业 Agent | A2A Task 机制 |
| **能力共享** | 跨 Agent 共享工具能力 | MCP Server 暴露 |
| **状态同步** | 多 Agent 协作完成复杂任务 | A2A 事件订阅 |
| **结果汇总** | 聚合多个 Agent 的执行结果 | A2A Artifact |

### 5.3 跨 LLM 调用适配（LLM 层）

#### 5.3.1 工具调用协议差异

三大主流 LLM 提供商的工具调用协议存在根本性差异：

| 差异点 | OpenAI | Claude | Gemini |
|--------|--------|--------|--------|
| 工具定义字段 | `function.parameters` | `input_schema` | `parameters` (proto) |
| 参数类型系统 | JSON Schema | JSON Schema | Proto enum |
| LLM 返回格式 | JSON 字符串 | dict 对象 | Proto 结构 |
| 多工具调用 | `tool_calls` 数组 | `tool_use` content blocks | 重复 `function_call` |
| 工具结果回传 | `tool` role message | `tool_result` content block | `function_response` part |
| 并行调用支持 | ✅ 原生 | ✅ 原生 | ⚠️ 有限 |
| 强制调用工具 | `tool_choice: {function: name}` | `tool_choice: {type: "tool", name: name}` | `function_calling_config` |

#### 5.3.2 协议适配策略

**方案一：MCP 统一协议（推荐）**

通过 MCP Server 封装工具能力，各 LLM 提供商通过 MCP Client 访问，实现协议解耦。这是最高效的方案，只需实现一套工具定义，所有支持 MCP 的 Agent 均可使用。

**方案二：适配器模式（备选）**

为每个 LLM 提供商实现协议适配器，统一工具调用接口：

```typescript
abstract class ToolCallAdapter {
  abstract parseToolCalls(response: unknown): ToolCall[];
  abstract formatTools(tools: ToolDefinition[]): unknown[];
}
```

#### 5.3.3 格式分层策略（关键：区分两个维度）

**重要区分**：§5.3.3 定义的是**工具调用输出格式**（LLM 返回给 Agent 的结构化结果），与 §5.4 定义的**技能内容格式**（Agent 传递给 LLM 的 skill 指令格式）是两个完全不同的维度，禁止混淆。

| 维度 | 管辖范围 | 格式偏好 | 说明 |
|------|----------|----------|------|
| **技能内容格式**（§5.4） | Agent → LLM 的 skill 指令 | 框架特定（Claude XML、Codex 双负载等） | 由 SKCC Backend 根据目标框架自动渲染 |
| **工具调用输出格式**（§5.3.3） | LLM → Agent 的工具调用结果 | 结构化优先（YAML/JSON） | 由 skill 开发者定义，需遵循 JSON Schema |

**工具调用输出格式优先级**：
1. **YAML**：嵌套深度 ≥ 3 时首选（准确率 51.9%）
2. **JSON**：作为标准备选（准确率 43.1%）
3. **Markdown**：简单数据结构使用（准确率 48.2%）
4. **XML**：不推荐用于工具调用输出（准确率 33.8%）

#### 5.3.4 工具描述标准化

工具描述必须遵循以下规范：

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}
```

**命名约束**：
- 参数名禁止以 `-` 开头（Gemini 不支持）
- 使用 camelCase 命名风格
- 避免使用保留关键字

### 5.4 跨框架内容格式适配（SKCC Backend）

同一份 SkIR 必须能编译为多框架格式。**禁止在源 SKILL.md 中硬编码某一框架的特定语法**（如 Claude 专用的 XML 标签）——这是格式耦合，违反 O(m+n) 解耦原则。

#### 5.4.1 目标框架格式偏好表

| 框架 | 偏好格式 | 适配策略 | 注意事项 |
|------|----------|----------|----------|
| **Claude Code** | XML 语义分层 | Backend 渲染为 XML 标签嵌套 | 通过率提升最显著（+12.2 pp） |
| **Codex CLI** | XML-Tagged Markdown | **双负载生成**：同时输出 XML 结构与 Markdown 内容 | 避免 JSON「格式税」 |
| **Gemini CLI** | Markdown + YAML | 嵌套深度 ≥ 3 时自动切换 YAML | 格式容忍度高，优化收益为 0，但仍需正确渲染 |
| **Kimi CLI** | Full Markdown | 全 Markdown 输出，YAML 仅用于 frontmatter | 统计显著性最强（p=0.0063） |

#### 5.4.2 复杂度对比

- **未引入 SkIR**：m 份 skill × n 个框架 = **O(m×n)** 适配工作量
- **引入 SkIR 后**：m 份 skill → SkIR + n 个框架 Backend = **O(m+n)**
- **决策含义**：本项目新增框架适配时，只需新增 Backend，无需改写任何 skill 源文件。

## 六、Anti-Skill Injection 安全约束

### 6.1 四类强制反模式（编译期拦截）

下列四类操作在 Procedures 中出现时，AntiSkillInjector 强制注入安全约束；未声明对应 `permissions` 即判为 Critical 错误。

| 类别 | 触发示例 | 默认反模式数 | 强制约束 |
|------|----------|--------------|----------|
| **HTTP** | 无超时、无认证、明文传输 | http-timeout / http-auth / html-parse 等 | 必须声明 `permissions: network`，强制超时阈值 |
| **循环** | `while True`、无退出条件的递归 | 死循环检测 | 必须声明最大迭代次数 |
| **数据库** | 无事务的级联操作、SQL 拼接 | db-cascade / db-transaction / sql-injection | 必须声明 `permissions: db`，禁止字符串拼接 SQL |
| **解析** | 不安全的 HTML / JSON 解析 | html-parse（BeautifulSoup 无沙盒） | 必须声明解析器与超时 |

### 6.2 默认反模式库（11 个，编译期加载）

`AntiPatternLibrary` 默认包含：`http-timeout` / `http-auth` / `html-parse` / `db-cascade` / `db-transaction` / `sql-injection` / `file-delete` / `file-overwrite` / `git-force` / `git-history` / 死循环检测。

**扩展原则**：项目可扩展反模式库，但**禁止删除默认反模式**。新增反模式必须经过 PR review + 安全审计。

### 6.3 toxic flows 三要素防御

一个 skill 被判定为 toxic flow 当且仅当同时满足三要素：

1. **访问私有数据**（读取 `.env` / 密钥 / 用户隐私 / 数据库敏感字段）
2. **不可信来源指令**（解析外部网页 / 用户粘贴内容 / MCP 外部响应）
3. **可外部通信**（HTTP 请求 / 写入共享路径 / 调用 webhook）

**防御规则**：三要素中只要阻断任一即解除 toxic 风险。设计 skill 时必须在 `metadata.toxic_flow_analysis` 显式标注三要素状态（见 §2.2 frontmatter 模板）。三要素全为 true 的 skill 自动升级为 `security_level: critical`，禁止自动执行。

## 七、安全等级与 HITL 审批

### 7.1 四级安全等级

| 等级 | 审计行为 | HITL 要求 | 适用场景 |
|------|----------|-----------|----------|
| `low` | 仅基础格式校验 | 否 | 纯查询、只读操作、无副作用计算 |
| `medium` | 权限声明检查 | 否（默认） | 文件读写、受控网络访问、本地命令执行 |
| `high` | 强制 HITL + 高危词汇扫描 | **是** | 数据库 DDL、生产环境部署、批量删除 |
| `critical` | 禁止自动执行 | **是**（必须人工审批） | 不可逆操作、涉及凭证、toxic flow 三要素全满足 |

### 7.2 HITL 触发条件（任一满足即触发）

1. `hitl_required: true` 显式声明
2. `security_level` 为 `high` 或 `critical`
3. Procedures 中出现高危关键词（见 §7.3）
4. `permissions` 中包含 `db:*:ALTER` / `db:*:DROP` / `exec:shutdown` 等 Critical 级 scope
5. toxic flow 三要素全为 true

### 7.3 高危关键词严重度（统一四级输出）

**重要**：本节定义的四级严重度同时适用于：(a) 编译期 Anti-Skill 扫描结果；(b) Reviewer 模式 skill 的审查输出。两者必须使用同一套分级，禁止出现两套不一致的标准。

| 严重度 | 关键词示例（编译期扫描） | Reviewer 输出含义 | 缺权限时行为 |
|--------|--------------------------|-------------------|--------------|
| **Critical** | `rm -rf` / `format` / `DROP` / `TRUNCATE` / `GRANT` / `shutdown` / `reboot` | 阻断性缺陷，禁止发布 | 编译失败，禁止发布 |
| **Error** | `delete file` / `DELETE` / `ALTER` | 必须修复 | 编译失败，必须补声明权限 |
| **Warning** | `UPDATE` | 建议修改 | 编译告警，记录但放行 |
| **Info** | — | 仅供参考 | 不影响编译 |

**与 chinese-code-review skill 协同**：Reviewer 类 skill 的输出分级应与本节四级保持一致；若现有 skill 使用三级（Error/Warning/Info），改版时必须升级为四级以对齐编译期扫描。

## 八、Fail-Fast 编译拦截纪律

下列情况必须 Fail-Fast，**禁止"先发布后修复"**：

1. `name` / `description` / `metadata.pattern` 字段缺失或格式不合规
2. `description` 包含 XML 标签（攻击面）
3. `metadata.pattern` 声明的模式与 SKILL.md 正文结构不匹配（如声明 `pipeline` 但无 gate condition）
4. `permissions` 声明与 Procedures 中实际操作不匹配
5. Critical 级高危关键词未声明对应权限
6. `pre_conditions` / `post_conditions` 在 `security_level ≥ high` 时缺失
7. toxic flow 三要素全为 true 但 `security_level` 未升至 `critical`
8. MCP 依赖声明但 `mcp_servers` 字段缺失
9. 嵌套深度 ≥ 3 但目标为 Gemini Backend 时未启用 YAML 优化
10. L2 正文超过 5000 token 上限且未下沉到 L3 资源

**与 project_rules.md 的协同**：项目规则要求"提交代码前必须通过 lint 和 typecheck"。skill 开发同等严格——提交 SKILL.md 前必须通过本规则全部 Fail-Fast 检查。

## 九、技能开发纪律（强制清单）

新建或改版 skill 时，必须按以下顺序自检，任一项不通过即禁止合入。本清单合并设计模式约束与可靠性约束，按主题分组。

### 9.1 模式与结构（来自设计模式）

1. **模式声明**：在 `metadata.pattern` 声明 `tool-wrapper` / `generator` / `reviewer` / `inversion` / `pipeline` 之一。
2. **Pipeline gate condition**：Pipeline 类 skill 每步必须有 gate condition，明确"通过什么校验才能进入下一步"。
3. **Inversion gating 指令**：Inversion 类 skill 必须有显式 gating 指令，禁止在 Discovery / Constraints 阶段就综合输出。
4. **Reviewer 输出分级**：Reviewer 类 skill 必须按 §7.3 四级严重度输出（Critical / Error / Warning / Info）。

### 9.2 渐进式披露（来自设计模式）

5. **L2 正文 ≤ 5000 token**：超出必须外置到 `references/` 或 `assets/`。
6. **禁止硬编码 L3 内容进 L2**：规范、模板、清单一律外置。

### 9.3 字段与权限（来自可靠性）

7. **必选字段**：`name`（kebab-case）+ `description`（≤1024 字符，无 XML 标签，含触发条件）+ `metadata.pattern`。
8. **权限对齐**：Procedures 中每个高危操作都有对应 `permissions` 声明。
9. **MCP 依赖**：使用 MCP 工具时必须声明 `mcp_servers`。

### 9.4 安全审查（来自可靠性）

10. **安全等级**：根据操作影响显式声明 `security_level`，禁止默认 `low` 用于敏感操作。
11. **HITL 评估**：高危操作显式声明 `hitl_required: true`，不得依赖运行时判断。
12. **toxic flow 标注**：`metadata.toxic_flow_analysis` 三要素状态必须显式声明。
13. **反模式扫描**：Procedures 不含未约束的 HTTP / 循环 / DB / 解析操作。
14. **Fallback 策略**：涉及不可逆操作时必须声明 `fallbacks`。
15. **断言保护**：`security_level ≥ high` 时必须声明 `pre_conditions` / `post_conditions`。

### 9.5 跨环境适配（来自 §5）

16. **格式中立**：源 SKILL.md 不含任何框架特定语法（Claude XML / Codex 双负载标记等）。
17. **嵌套深度**：若 `input_schema` / `output_schema` 嵌套 ≥ 3 层，确认目标框架适配策略（Gemini 启用 YAML 优化）。
18. **跨操作系统兼容**：脚本使用 `os.platform()` 检测操作系统，根据平台选择对应的实现；路径处理使用 `path.join()` 和 `os.EOL`；避免硬编码系统命令。
19. **MCP 协议优先**：skill 应优先通过 MCP 协议暴露工具能力，声明 `mcp_servers` 字段；避免直接依赖特定 Agent 框架的工具调用方式。
20. **A2A 协议兼容**：若 skill 需与外部 Agent 协作，对外接口应兼容 A2A Protocol v1.0 规范，包含 Agent Card、Task Object、Message Object 等核心概念。
21. **跨 LLM 协议适配**：工具定义使用标准化的 `input_schema` 格式，参数名禁止以 `-` 开头；支持 OpenAI、Claude、Gemini 三种工具调用协议的自动转换。
22. **格式分层区分**：明确区分"技能内容格式"（由 SKCC Backend 自动渲染，允许 XML）与"工具调用输出格式"（由开发者定义，结构化输出优先 YAML/JSON）。

### 9.6 技术选型与路径安全（来自 §10）

23. **TypeScript 唯一语言**：`scripts/` 目录下仅允许 `.ts` / `.tsx` 文件，禁止 `.py` / `.bat` / `.cmd` / `.ps1` / `.sh` 文件。
24. **绝对路径获取与校验**：所有路径处理必须先通过 `path.resolve()` 或 `path.join()` 获取绝对路径，再进行范围校验和安全检查（禁止 `..` 跳转、符号链接）。
25. **路径拼接规范**：强制使用 `path.join()` 进行路径组合，禁止字符串拼接（`+` / template literal）。
26. **敏感目录访问授权**：访问系统敏感目录时必须添加强制参数 `--confirm-sensitive-access`。Linux：`/etc/`、`/root/`、`/home/`（其他用户）、`~/.ssh/`、`~/.aws/`、`~/.gcp/`、`/var/log/`；macOS：`/Library/`、`/private/`、`/Users/`（其他用户）、`/Users/<User>/.ssh/`、`/Users/<User>/.aws/`、`/Users/<User>/.gcp/`、`/var/log/`；Windows：`C:\Windows\`、`C:\ProgramData\`、`C:\Users\`（其他用户）、`C:\Users\<User>\.ssh\`、`C:\Users\<User>\.aws\`、`C:\Users\<User>\.gcp\`、`C:\Users\<User>\AppData\`（见 §10.2.3）。

### 9.7 与 §12 验证规则的映射

本清单（§9）是开发阶段的自检项目，§12（技能开发验证规则）是完成后的验证项目，两者形成"开发期自检 + 完成期验证"的双重保障。映射关系如下：

| §9 自检项 | 对应 §12 验证项 |
|-----------|-----------------|
| 模式声明 | 技能结构完整性（§12.1 第12项） |
| Pipeline gate condition | 状态机正确性（§12.1 第4项）、门限有效性（§12.1 第6项） |
| Inversion gating 指令 | 逻辑正确性（§12.1 第7项） |
| Reviewer 输出分级 | 逻辑正确性（§12.1 第7项） |
| L2 正文 ≤ 5000 token | 阶段复杂度拆分正确性（§12.1 第10项） |
| 禁止硬编码 L3 内容进 L2 | 阶段复杂度拆分正确性（§12.1 第10项） |
| 必选字段 | 技能结构完整性（§12.1 第12项） |
| 权限对齐 | 脚本正确性（§12.1 第2项） |
| MCP 依赖 | 脚本正确性（§12.1 第2项） |
| 安全等级 | 方法论完备性（§12.1 第13项） |
| HITL 评估 | 方法论完备性（§12.1 第13项） |
| toxic flow 标注 | 方法论完备性（§12.1 第13项） |
| 反模式扫描 | 脚本正确性（§12.1 第2项）、逻辑正确性（§12.1 第7项） |
| Fallback 策略 | 逻辑完备性（§12.1 第8项） |
| 断言保护 | 逻辑完备性（§12.1 第8项） |
| 格式中立 | 平台适配性（§12.1 第9项） |
| 嵌套深度 | 平台适配性（§12.1 第9项） |
| 跨操作系统兼容 | 平台适配性（§12.1 第9项） |
| MCP 协议优先 | 脚本正确性（§12.1 第2项） |
| A2A 协议兼容 | 能力可迁移性（§12.1 第14项） |
| 跨 LLM 协议适配 | 平台适配性（§12.1 第9项） |
| 格式分层区分 | 逻辑正确性（§12.1 第7项） |
| TypeScript 唯一语言 | 脚本正确性（§12.1 第2项，见 §10.1） |
| 绝对路径获取与校验 | 脚本可测试性设计（§12.1 第19项，见 §10.2.1） |
| 路径拼接规范 | 脚本可测试性设计（§12.1 第19项，见 §10.2.2） |
| 敏感目录访问授权 | 脚本正确性（§12.1 第2项，见 §10.2.3） |
| 所有文本性说明 | 文本性说明完备性（§12.1 第18项）、文本性说明内部一致性（§12.1 第17项） |
| 脚本设计 | 脚本可测试性设计（§12.1 第19项） |

> **执行顺序**：先按 §9 自检清单逐项检查，通过后再按 §12 验证规则逐项验证。两者均通过方可合入。

## 十、技能开发技术选型

### 10.1 脚本语言规范

技能开发必须采用 **TypeScript** 作为唯一脚本语言，禁止使用其他脚本语言。

| 语言 | 状态 | 说明 |
|------|------|------|
| TypeScript（`.ts` / `.tsx`） | **强制使用** | 唯一允许的脚本语言，支持类型安全和编译期检查 |
| Python（`.py`） | **禁止** | 不允许在 skill 的 `scripts/` 目录中使用 |
| Batch（`.bat` / `.cmd`） | **禁止** | 不允许使用 Windows 批处理脚本 |
| PowerShell（`.ps1`） | **禁止** | 不允许使用 PowerShell 脚本 |
| Shell（`.sh`） | **禁止** | 不允许使用 Shell 脚本 |

**执行方式**：使用 `npx tsx` 直接运行 TypeScript 文件，或通过 `npm run` 脚本入口执行。

### 10.2 路径处理强制规则

#### 10.2.1 绝对路径获取与校验

所有路径处理必须遵循以下流程：

1. **获取绝对路径**：使用 `path.resolve()` 或 `path.join()` 将相对路径转换为绝对路径
2. **路径校验**：校验路径是否在允许的范围内（如项目根目录、临时目录）
3. **安全检查**：检查路径是否包含 `..` 跳转、符号链接等安全风险

**禁止**直接使用用户输入的相对路径或未经校验的路径。

#### 10.2.2 路径拼接规范

**禁止文本路径拼接**：禁止使用字符串拼接（`+` / template literal）构建路径。

**强制使用 `path.join()`**：所有路径组合必须通过 Node.js 的 `path.join()` 方法进行。

```typescript
import path from 'path';
const fullPath = path.join(baseDir, 'subdir', 'file.txt');
```

#### 10.2.3 敏感目录访问授权

访问以下系统敏感目录时，必须**强制要求人类授权**。敏感目录按操作系统分类，涵盖 Linux、macOS 和 Windows 平台：

| 操作系统 | 敏感目录 | 触发条件 | 授权方式 |
|----------|----------|----------|----------|
| **Linux** | `/etc/` | 读取或写入系统配置文件 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `/root/` | 任何访问 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `/home/`（其他用户） | 访问非当前用户目录 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `~/.ssh/` | 读取 SSH 密钥 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `~/.aws/` | 读取 AWS 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `~/.gcp/` | 读取 GCP 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Linux** | `/var/log/` | 读取系统日志 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Library/` | 读取或写入系统库文件 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/private/` | 任何访问 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/`（其他用户） | 访问非当前用户目录 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/<User>/.ssh/` | 读取 SSH 密钥 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/<User>/.aws/` | 读取 AWS 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/Users/<User>/.gcp/` | 读取 GCP 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **macOS** | `/var/log/` | 读取系统日志 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Windows\` | 读取或写入系统目录 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\ProgramData\` | 读取或写入程序数据 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\`（其他用户） | 访问非当前用户目录 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\.ssh\` | 读取 SSH 密钥 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\.aws\` | 读取 AWS 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\.gcp\` | 读取 GCP 凭证 | 添加强制参数 `--confirm-sensitive-access` |
| **Windows** | `C:\Users\<User>\AppData\` | 读取或写入应用数据 | 添加强制参数 `--confirm-sensitive-access` |

**授权机制**：脚本执行时必须检查是否携带强制授权参数，未授权则立即终止并提示用户。

**跨平台检测**：脚本必须使用 `os.platform()` 检测当前操作系统，根据平台选择对应的敏感目录列表进行校验。

## 十一、与现有规则的协同矩阵

| 场景 | 主导规则 | 协同规则 |
|------|----------|----------|
| 新建 skill 的需求澄清 | methodology.md（拷问循环） | 本规则 §3 Pattern 4 Inversion |
| skill 逻辑组织 | 本规则 §3（5 种模式） | 本规则 §2.2（必选字段约束） |
| skill 安全审查 | 本规则 §6 Anti-Skill + §7 安全等级 | project_rules.md（安全规范） |
| skill 跨环境适配 | 本规则 §5（OS层 + 协议层 + LLM层） | 本规则 §4 四阶段流水线 |
| skill 改版审计 | 本规则 §8 Fail-Fast 清单 + §9 自检清单 | superpowers-zh.md（verification-before-completion） |
| skill 审查输出分级 | 本规则 §7.3 四级严重度 | chinese-code-review skill（话术分级对齐） |
| skill 验证执行 | 本规则 §12 验证规则 | project_rules.md（测试规范） |
| skill 技术选型与路径安全 | 本规则 §10 技术选型 | 本规则 §12.1 第2项、第19项 |

## 十二、技能开发验证规则

技能开发完成后必须通过以下 19 项验证，任一项不通过即禁止合入或发布。验证分为三个层级：编译期自动验证、运行时集成验证、人工审查验证。

### 12.1 验证项目清单

| 序号 | 验证项 | 验证层级 | 验证方法 | 失败行为 |
|------|--------|----------|----------|----------|
| 1 | **指令遵从** | 人工审查 | 对照 `SKILL.md` 指令，执行实际任务验证 agent 是否逐条遵循 | 需修改指令或重新训练 |
| 2 | **脚本正确性** | 编译期 + 运行时 | 执行 `scripts/` 下所有脚本，验证返回码、输出格式、异常处理；检查脚本语言仅为 `.ts` / `.tsx`（禁止 `.py` / `.bat` / `.cmd` / `.ps1` / `.sh`）；验证敏感目录访问需 `--confirm-sensitive-access` 参数（见 §10.1、§10.2.3） | 修复脚本直至全部通过 |
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
| 13 | **方法论完备性** | 人工审查 | 验证 skill 流程与 `methodology.md` SOP 对齐（拷问循环 → 冻结规格书 → 隔离执行） | 补全方法论环节 |
| 14 | **能力可迁移性** | 运行时 | 在不同场景、不同输入下验证 skill 表现，确认核心能力可迁移；验证 A2A 协议兼容性 | 增强通用性设计 |
| 15 | **测试完整性** | 编译期 + 运行时 | 单元测试（函数级）、模块测试（组件级）、集成测试（流程级）、关键逻辑覆盖测试（核心逻辑验证）、全流程黄金测试（端到端基准比对） | 补充缺失测试类型 |
| 16 | **脚本与文本性说明一致性** | 编译期 + 人工审查 | 验证脚本行为与 `SKILL.md`、`references/`、`assets/` 中文本说明一致，无描述与实现不一致 | 修正脚本或文本说明 |
| 17 | **文本性说明内部一致性** | 人工审查 | 检查 `SKILL.md`、`references/`、`assets/` 内部术语、逻辑、步骤的一致性，无矛盾或冲突 | 修正文本性说明 |
| 18 | **文本性说明完备性** | 人工审查 | 验证 `SKILL.md`、`references/`、`assets/` 中文本说明覆盖所有功能点、步骤、异常处理和边界情况，无遗漏信息 | 补充缺失的文本说明 |
| 19 | **脚本可测试性设计** | 编译期 + 人工审查 | 检查脚本设计支持单元测试（函数独立、依赖注入）、可观测性（日志、指标）、可调试性（断点、错误信息）；验证路径处理使用 `path.join()`（禁止字符串拼接），所有路径先获取绝对路径再校验（见 §10.2.1、§10.2.2） | 重构脚本以支持测试 |

### 12.2 Token 预算意识强制规则

**切分大块约束**：当 skill 涉及的目标上下文超过 **12 万 token** 时，必须强制拆解为多个子目标，禁止单一大块执行。

| 上下文规模 | 处理策略 | 验证要求 |
|------------|----------|----------|
| ≤ 5000 token | 单步执行 | L2 正文直接承载 |
| 5000 ~ 120000 token | 分阶段加载 | L3 资源外置，按需加载 |
| > 120000 token | **强制拆解** | 拆分为多个独立 skill，通过 Pipeline 模式串联 |

**验证方法**：编译期计算 `SKILL.md` 正文 + `references/` + `assets/` 全部内容的 token 总量，超过阈值自动告警。

### 12.3 测试层级定义

| 层级 | 覆盖范围 | 验证目标 | 通过标准 |
|------|----------|----------|----------|
| **单元测试** | 单个函数/方法 | 逻辑正确性 | 100% 覆盖分支 |
| **模块测试** | 组件/工具类 | 接口正确性 | 所有公开接口验证通过 |
| **集成测试** | 多模块协作流程 | 端到端正确性 | 完整流程无错误 |
| **关键逻辑覆盖测试** | skill 核心业务逻辑 | 核心逻辑正确性 | 所有关键逻辑分支验证通过 |
| **全流程黄金测试** | 完整端到端执行流程 | 一致性保障 | 输出与基准完全一致 |

## 十三、局限性认知（避免过度承诺）

引用 SKCC 数据时必须同时告知局限性，禁止选择性引用利好数据：

1. **Gemini 平台增益为 0**：SKCC 的优化效果严格模型依赖，不是"一键通杀"。本项目若主用 Gemini，不应期待通过率提升。
2. **5.2% 安全风险未拦截**：Anti-Skill 触发率 94.8% 意味着仍有约 5.2% 风险需运行时兜底，禁止以"编译期已防护"为由关闭运行时监控。
3. **覆盖边界**：Anti-Skill 主要覆盖 HTTP / 循环 / DB / 解析四类，对组合型风险（如 SkillReact 论文指出的"单独安全技能组合后产生风险"）覆盖不足，复杂 skill 需额外人工审计。
4. **生态成熟度**：SkCC 解决格式适配，但部署路径碎片化（`.claude/skills/` / `.github/skills/` 等）仍需生态协同。本项目统一使用 `.trae/skills/` 路径。
5. **Inversion 模式 68% retry 削减**：来源 FAQ 提及，但需在具体 skill 中实测验证，不直接承诺。
6. **MCP/A2A 互补而非替代**：MCP 负责工具调用，A2A 负责 Agent 协作，两者缺一不可。禁止认为"选一个就够了"。
7. **格式分层必须区分**：技能内容格式（SKCC Backend 自动渲染）与工具调用输出格式（开发者定义）是两个独立维度，禁止混淆。
