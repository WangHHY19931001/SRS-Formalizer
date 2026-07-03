---
alwaysApply: true
---

# Agent Skill 跨环境适配

> 本规则约束 `.trae/skills/` 下所有 SKILL.md 的跨环境兼容策略。

## 跨环境适配策略

skill 必须在三个维度实现跨环境兼容：**操作系统层**（Windows/macOS/Linux）、**Agent 协议层**（MCP/A2A）、**LLM 调用层**（OpenAI/Claude/Gemini）。这三个维度正交且互补，必须分别处理。

## 跨操作系统适配（OS 层）

### 输入事件注入抽象层

三大平台的输入事件注入机制差异显著，必须通过统一抽象层屏蔽底层细节：

| 平台 | API 类型 | 权限要求 | 事件可见性 |
|------|----------|----------|------------|
| **Windows** | SendInput (user32.dll) | 无特殊权限 | 注入至前台进程输入队列 |
| **macOS** | CGEventPost (CoreGraphics) | 辅助功能授权 | 全局捕获链中生效 |
| **Linux** | uinput kernel module | root 或 uinput 组权限 | 内核态虚拟设备，完全透明 |

**设计原则**：脚本必须使用 `os.platform()` 检测当前操作系统，动态选择对应的输入事件实现。

### GUI 元素识别技术栈

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

### 窗口控制抽象

将 `HWND`（Windows）、`NSWindow*`（macOS）和 `X11 Window ID` 统一封装为不可变的 `WindowID` 类型：

```typescript
type Platform = 'win32' | 'darwin' | 'linux';

interface WindowID {
  platform: Platform;
  handle: number | bigint;
}
```

### 路径与环境差异

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

## 跨 Agent 协议适配（协议层）

### MCP 与 A2A 的互补关系

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

### MCP（Model Context Protocol）

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

### A2A Protocol v1.0

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

### 多 Agent 协作模式

| 模式 | 场景 | 实现方式 |
|------|------|----------|
| **任务委派** | 将子任务分配给专业 Agent | A2A Task 机制 |
| **能力共享** | 跨 Agent 共享工具能力 | MCP Server 暴露 |
| **状态同步** | 多 Agent 协作完成复杂任务 | A2A 事件订阅 |
| **结果汇总** | 聚合多个 Agent 的执行结果 | A2A Artifact |

## 跨 LLM 调用适配（LLM 层）

### 工具调用协议差异

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

### 协议适配策略

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

### 格式分层策略（关键：区分两个维度）

**重要区分**：工具调用输出格式（LLM 返回给 Agent 的结构化结果）与技能内容格式（Agent 传递给 LLM 的 skill 指令格式）是两个完全不同的维度，禁止混淆。

| 维度 | 管辖范围 | 格式偏好 | 说明 |
|------|----------|----------|------|
| **技能内容格式** | Agent → LLM 的 skill 指令 | 框架特定（Claude XML、Codex 双负载等） | 由 SKCC Backend 根据目标框架自动渲染 |
| **工具调用输出格式** | LLM → Agent 的工具调用结果 | 结构化优先（YAML/JSON） | 由 skill 开发者定义，需遵循 JSON Schema |

**工具调用输出格式优先级**：
1. **YAML**：嵌套深度 ≥ 3 时首选（准确率 51.9%）
2. **JSON**：作为标准备选（准确率 43.1%）
3. **Markdown**：简单数据结构使用（准确率 48.2%）
4. **XML**：不推荐用于工具调用输出（准确率 33.8%）

### 工具描述标准化

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

## 跨框架内容格式适配（SKCC Backend）

同一份 SkIR 必须能编译为多框架格式。**禁止在源 SKILL.md 中硬编码某一框架的特定语法**（如 Claude 专用的 XML 标签）——这是格式耦合，违反 O(m+n) 解耦原则。

### 目标框架格式偏好表

| 框架 | 偏好格式 | 适配策略 | 注意事项 |
|------|----------|----------|----------|
| **Claude Code** | XML 语义分层 | Backend 渲染为 XML 标签嵌套 | 通过率提升最显著（+12.2 pp） |
| **Codex CLI** | XML-Tagged Markdown | **双负载生成**：同时输出 XML 结构与 Markdown 内容 | 避免 JSON「格式税」 |
| **Gemini CLI** | Markdown + YAML | 嵌套深度 ≥ 3 时自动切换 YAML | 格式容忍度高，优化收益为 0，但仍需正确渲染 |
| **Kimi CLI** | Full Markdown | 全 Markdown 输出，YAML 仅用于 frontmatter | 统计显著性最强（p=0.0063） |

### 复杂度对比

- **未引入 SkIR**：m 份 skill × n 个框架 = **O(m×n)** 适配工作量
- **引入 SkIR 后**：m 份 skill → SkIR + n 个框架 Backend = **O(m+n)**
- **决策含义**：本项目新增框架适配时，只需新增 Backend，无需改写任何 skill 源文件。