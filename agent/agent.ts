/**
/**
 * agent.ts — Deep Agent factory powered by deepagentsjs
 *
 * Built on createDeepAgent which provides:
 *   - Filesystem tools (read_file, write_file, edit_file, ls, glob, grep)
 *   - Sub-agent delegation (task) with isolated context windows
 *   - Planning (write_todos) for task breakdown and progress tracking
 *   - Context management via memory middleware
 *
 * We add:
 *   - Shell execution (run_command)
 *   - Web search (web_search) and HTTP requests (http_request)
 *   - MCP server auto-registration from llm-config.json
 *   - Custom system prompt with workDir, WORK_TABOOS, and WORK_RULES
 */

import { createDeepAgent } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StructuredTool } from "@langchain/core/tools";
import {
  runCommandTool,
  webSearchTool,
  httpRequestTool,
  createMcpRegisterTool,
  createMcpCallTool,
} from "./tools.js";
import { loadLlmConfig } from "./llm-config.js";
import { registerMcpServer, callMcpTool } from "./mcp.js";
import * as fs from "node:fs";

let agentIdCounter = 0;

// ===================== System Prompt =====================

const WORK_TABOOS = [
  "禁止修改 .git 目录和已提交的代码文件",
  "禁止执行 rm -rf、fork bomb 等危险命令",
  "禁止反复检查同一文件或目录超过 2 次——第一次就记住结果",
  "禁止在任务完成后继续调用工具——必须直接输出文本总结",
  "优先行动而非探索——直接执行任务步骤，不要反复确认文件是否存在",
  "如果命令失败，最多重试 1 次，然后报告错误继续下一步",
];

const WORK_RULES = [
  "对于 LLM 密集型任务（需求提取、术语表生成、架构分解），必须使用 task 分派子代理执行——禁止手动编写 JSONL 或直接生成大量结构化数据",
  "提取需求时使用 guided-extract 两步模式：先获取 guided_prompt（--template 模式），再逐行调用 --line 模式处理 LLM 输出的每一行",
  "始终遵循技能 SKILL.md 中的流水线阶段顺序，不要跳步",
];

function buildSystemPrompt(
  skillsDir?: string,
  projectRoot?: string,
  workDir?: string,
): string {
  const skillsLine = skillsDir ? `\n当前技能所在目录：${skillsDir}` : "";
  const projectLine = projectRoot ? `\n当前项目目录：${projectRoot}` : "";
  const workDirLine = workDir
    ? `\n当前技能工作目录：${workDir}（所有 CLI 命令必须用 --workdir ${workDir}，init 除外——init 用 --output ${workDir}）`
    : "";
  const taboos = WORK_TABOOS.map((t, i) => `  ${i + 1}. ${t}`).join("\n");
  const rules = WORK_RULES.map((r, i) => `  ${i + 1}. ${r}`).join("\n");

  return `你是一个工作 agent，被设计为在实际环境中执行工作任务。${skillsLine}${projectLine}${workDirLine}

你将尽可能完成用户任务。

工作禁忌如下：
${taboos}

工作规则如下：
${rules}`;
}

// ===================== Config =====================

export interface AgentConfig {
  configPath: string;
  role: "orchestrator" | "worker";
  skillsDir?: string;
  projectRoot?: string;
  workDir?: string;
  logDir?: string;
  depth?: number;
}

export interface AgentHandle {
  id: string;
  role: string;
  receive: (message: string, fromId: string) => Promise<string>;
}

// ===================== createAgent =====================

export async function createAgent(config: AgentConfig): Promise<{
  agent: {
    invoke: (
      input: Record<string, unknown>,
      config?: Record<string, unknown>,
    ) => Promise<{ messages?: Array<{ content: unknown }> }>;
  };
  id: string;
  handle: AgentHandle;
}> {
  const id = `${config.role}-${Date.now()}-${++agentIdCounter}`;
  const llmConfig = loadLlmConfig(config.configPath);

  // Qwen-compatible: strip file content blocks before API call
  class QwenCompatibleChatOpenAI extends ChatOpenAI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    override async invoke(input: any, options?: any): Promise<any> {
      const messages: BaseMessage[] = Array.isArray(input) ? input : [input];
      const sanitized = messages.map((msg) => {
        const raw = msg as unknown as { content: unknown };
        const content = raw.content;
        if (!Array.isArray(content)) return msg;
        const cleaned = content.map((block: Record<string, unknown>) => {
          if (block.type === "file") {
            const name =
              (block as { file?: { name?: string } }).file?.name || "unknown";
            return { type: "text", text: `[File: ${name}]` };
          }
          return block;
        });
        return new HumanMessage({ content: cleaned as Array<{ type: string; text: string }> });
      });
      return super.invoke(sanitized, options);
    }
  }

  const llm = new QwenCompatibleChatOpenAI({
    model: llmConfig.name,
    temperature: 0.1,
    configuration: { baseURL: llmConfig.baseURL, apiKey: llmConfig.key },
  });

  // ===================== MCP Auto-Registration =====================

  const mcpTools: StructuredTool[] = [];

  if (!process.env.SKIP_MCP) {
    const mcpServerConfigs = llmConfig.mcp_servers || [];
    const mcpResults = await Promise.allSettled(
      mcpServerConfigs.map(async (mcpEntry) => {
        const timeoutMs = 5000;
        const connectPromise = registerMcpServer({
          transport: "stdio",
          command: mcpEntry.command,
          args: mcpEntry.args,
        });
        const result = await Promise.race([
          connectPromise.then((tools) => ({ ok: true as const, tools })),
          new Promise<{ ok: false; tools: string[] }>((resolve) =>
            setTimeout(() => resolve({ ok: false, tools: [] }), timeoutMs),
          ),
        ]);
        return { entry: mcpEntry, ...result };
      }),
    );

    for (const r of mcpResults) {
      if (r.status === "rejected") continue;
      const { entry, ok, tools: toolNames } = r.value;
      if (!ok) continue;

      for (const name of toolNames) {
        mcpTools.push(
          tool(
            async (args: Record<string, unknown>) => callMcpTool(name, args),
            {
              name: `mcp_${name}`,
              description: `[${entry.name}] MCP tool: ${name}`,
              schema: z.object({}).passthrough(),
            },
          ),
        );
      }
    }
  }

  // MCP dynamic registration tools (runtime)
  const mcpRegisterTool = createMcpRegisterTool(async (mcpConfig) => {
    const toolNames = await registerMcpServer(mcpConfig);
    return [...toolNames, ...toolNames.map((n) => `mcp_${n}`)];
  });

  const mcpCallTool = createMcpCallTool(async (toolName, args) => {
    const actualName = toolName.startsWith("mcp_")
      ? toolName.slice(4)
      : toolName;
    return callMcpTool(actualName, args);
  });

  // ===================== Build Agent =====================

  const systemPrompt = buildSystemPrompt(
    config.skillsDir || process.env.SKILL_SCRIPTS_DIR,
    config.projectRoot || process.env.PROJECT_ROOT,
    config.workDir || process.env.WORK_DIR,
  );

  // Specialized sub-agents for srs-formalizer pipeline stages.
  // Each has isolated context, independent tools, and file-based handoff.
  // They do NOT receive the task tool (no recursive delegation).
  const subagents: SubAgent[] = [
    {
      name: "extractor",
      description:
        "需求提取子代理。从 SRS 分片中逐行提取需求 JSONL，使用 guided-extract --line 模式。",
      systemPrompt:
        "你是需求提取器。对每个分片：获取 guided_prompt → 逐行输出 JSON → 用 run_command 调用 guided-extract --line 校验追加。完成后报告产物路径。",
      tools: [runCommandTool],
    },
    {
      name: "verifier",
      description:
        "校验子代理。验证 JSONL/BDD/Cypher 产物格式，运行 validate-* 命令，报告不通过的记录。",
      systemPrompt:
        "你是校验器。运行对应的 validate-* CLI 命令检查产物格式。列出所有不通过的记录及原因。不要修改文件，只报告问题。",
      tools: [runCommandTool],
    },
    {
      name: "researcher",
      description:
        "研究子代理。联网搜索技术原理、论文、开源实现，为 S6 收敛循环提供事实依据。",
      systemPrompt:
        "你是研究员。联网搜索相关技术原理、论文 URL、开源实现。产出结构化的研究摘要。",
      tools: [webSearchTool, httpRequestTool, runCommandTool],
    },
  ];

  const agent = createDeepAgent({
    model: llm,
    systemPrompt,
    tools: [
      runCommandTool,
      webSearchTool,
      httpRequestTool,
      mcpRegisterTool,
      mcpCallTool,
      ...mcpTools,
    ],
    subagents,
  });

  // ===================== Trace Callback =====================

  const logDir = config.logDir || "/tmp/srs-agent-traces";
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = `${logDir}/${id}.log`;
  const logLine = (msg: string) => {
    const ts = new Date().toISOString();
    const line = `${ts} ${msg}\n`;
    process.stderr.write(line);
    try { fs.appendFileSync(logPath, line, "utf-8"); } catch { /* ignore */ }
  };

  let turnCount = 0;
  const trace = new (class extends BaseCallbackHandler {
    name = "console-tracer";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async handleToolStart(tool: any, input: string): Promise<void> {
      turnCount++;
      const preview = input.slice(0, 150).replace(/\n/g, "\\n");
      logLine(`[${turnCount}] 🔧 ${tool.name || tool.id?.join(".") || "?"} ${preview}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async handleToolEnd(output: any): Promise<void> {
      const raw = typeof output === "string" ? output : JSON.stringify(output);
      const preview = raw.slice(0, 200).replace(/\n/g, "\\n");
      logLine(`     ✅ ${preview}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async handleLLMStart(_llm: any, _prompts: string[]): Promise<void> {
      logLine(`[${turnCount + 1}] 🤖 LLM`);
    }
  })();

  // ===================== AgentHandle =====================

  // deepagents invoke has a complex generic signature; bridge via unknown
  // Must .bind(agent) to preserve `this` (ReactAgent private fields like #defaultConfig)
  const deepInvoke = agent.invoke.bind(agent) as unknown as (
    input: Record<string, unknown>,
    config?: Record<string, unknown>,
  ) => Promise<{ messages?: Array<{ content: unknown }> }>;

  const invoke = (
    input: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<{ messages?: Array<{ content: unknown }> }> =>
    deepInvoke(input, { ...config, callbacks: [trace] });

  const handle: AgentHandle = {
    id,
    role: config.role,
    async receive(message: string, _fromId: string): Promise<string> {
      try {
        const result = await invoke({
          messages: [new HumanMessage(message)],
        });
        const msgs = result.messages || [];
        const last = msgs[msgs.length - 1];
        return last ? (last.content as string) || "" : "";
      } catch (e) {
        return `ERROR: ${(e as Error).message}`;
      }
    },
  };

  return {
    agent: { invoke },
    id,
    handle,
  };
}
