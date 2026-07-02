/**
 * agent.ts — LangGraph-based agent factory
 *
 * Uses a custom StateGraph with ReAct pattern for full control over:
 * - Tool execution (special handling for spawn_sub_agent, register/unregister)
 * - Termination conditions (LLM can stop by producing text without tool calls)
 * - Context management (auto-compress at thresholds)
 *
 * Dynamic tool registry, A2A agent directory, and context-aware tools.
 */

import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StructuredTool } from "@langchain/core/tools";
import { ToolRegistry } from "./tool-registry.js";
import { AgentDirectory, type AgentHandle } from "./agent-directory.js";
import { ContextManager, createContextTools } from "./context.js";
import {
  BASE_TOOLS,
  createSpawnSubAgentTool,
  createRegisterToolsTool,
  createUnregisterToolsTool,
  createMcpRegisterTool,
  createMcpCallTool,
} from "./tools.js";
import { loadLlmConfig } from "./llm-config.js";
import { registerMcpServer, callMcpTool } from "./mcp.js";
import * as fs from "node:fs";

let agentIdCounter = 0;

// ===================== Dynamic System Prompt =====================

const WORK_TABOOS = [
  "禁止修改 .git 目录和已提交的代码文件",
  "禁止执行 rm -rf、fork bomb 等危险命令",
  "禁止反复检查同一文件或目录超过 2 次——第一次就记住结果",
  "禁止在任务完成后继续调用工具——必须直接输出文本总结",
  "优先行动而非探索——直接执行任务步骤，不要反复确认文件是否存在",
  "如果命令失败，最多重试 1 次，然后报告错误继续下一步",
];

function buildSystemPrompt(
  toolNames: string[],
  skillsDir: string,
  projectRoot: string,
): string {
  const toolList = toolNames.map((n) => `  - ${n}`).join("\n");
  const taboos = WORK_TABOOS.map((t, i) => `  ${i + 1}. ${t}`).join("\n");
  return `你是一个工作 agent，你拥有如下工具：
${toolList}

你被设计为在实际环境中执行工作任务，任务信息由用户提示词说明。
当前技能所在目录：${skillsDir}
当前项目目录：${projectRoot}

你将尽可能完成用户任务。

工作禁忌如下：
${taboos}`;
}

// ===================== Config =====================

export interface AgentConfig {
  configPath: string;
  role: "orchestrator" | "worker";
  registry?: ToolRegistry;
  directory?: AgentDirectory;
  maxTurns?: number;
  maxContextTokens?: number;
  logDir?: string;
  skillsDir?: string;
  projectRoot?: string;
  depth?: number;
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
  const maxTokens =
    config.maxContextTokens || llmConfig["max-model-len"] || 131072;
  const maxTurns = config.maxTurns || 250;
  const logDir = config.logDir || "/tmp/srs-agent-logs";

  // Ensure log dir exists
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = `${logDir}/${id}.jsonl`;

  function writeLog(type: string, data: Record<string, unknown>) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      type,
      agentId: id,
      ...data,
    });
    try {
      fs.appendFileSync(logPath, line + "\n", "utf-8");
    } catch {
      /* silent */
    }
  }

  const llm = new ChatOpenAI({
    model: llmConfig.name,
    temperature: 0.1,
    configuration: { baseURL: llmConfig.baseURL, apiKey: llmConfig.key },
  });

  // Tool registry & agent directory
  const registry = config.registry || new ToolRegistry();
  const directory = config.directory || new AgentDirectory();

  // ===================== Auto-register configured MCP servers =====================
  const mcpServerConfigs = llmConfig.mcp_servers || [];
  const autoRegisteredMcpTools: string[] = [];

  // Check SKIP_MCP env var
  if (process.env.SKIP_MCP) {
    writeLog("mcp_skip", {
      reason: `SKIP_MCP env var set: ${process.env.SKIP_MCP}`,
    });
  } else {
    // Register all MCP servers in parallel with a per-server timeout
    const mcpResults = await Promise.allSettled(
      mcpServerConfigs.map(async (mcpEntry) => {
        const timeoutMs = 5000; // 5s per server (reduced from 15s)
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
      if (r.status === "rejected") {
        writeLog("mcp_auto_register_error", {
          server: "unknown",
          error: String(r.reason),
        });
        continue;
      }
      const { entry, ok, tools: toolNames } = r.value;
      if (!ok) {
        writeLog("mcp_auto_register_timeout", { server: entry.name });
        continue;
      }

      writeLog("mcp_auto_register", { server: entry.name, tools: toolNames });

      // Register each MCP tool with mcp_ prefix in the ToolRegistry
      for (const name of toolNames) {
        const mcpToolName = `mcp_${name}`;
        registry.addLazy(mcpToolName, async () => {
          const { tool: langchainTool } = await import("@langchain/core/tools");
          return langchainTool(
            async (args: Record<string, unknown>) => callMcpTool(name, args),
            {
              name: mcpToolName,
              description: `[${entry.name}] MCP tool: ${name}`,
              schema: z.object({}).passthrough(),
            },
          );
        });
        autoRegisteredMcpTools.push(mcpToolName);
      }
      // Auto-register for immediate use
      await registry.register(toolNames.map((n) => `mcp_${n}`));
    }
  } // end else (skip MCP)

  // Context manager
  const openaiClient = new (await import("openai")).default({
    baseURL: llmConfig.baseURL,
    apiKey: llmConfig.key,
  });
  const ctxManager = new ContextManager(
    openaiClient,
    llmConfig.name,
    maxTokens,
    2,
  );

  // Context tracking
  const messageBox: { current: Array<{ role: string; content: unknown }> } = {
    current: [],
  };

  const { contextInfoTool, compressContextTool } = createContextTools(
    ctxManager,
    () => messageBox.current as any,
  );

  // ===================== Spawn Sub-Agent Handler =====================

  /**
   * Recursively spawn a worker sub-agent.
   * The sub-agent gets its own StateGraph, tool set, and message context.
   */
  async function spawnHandler(task: string): Promise<string> {
    writeLog("spawn_sub_agent_start", {
      task: task.slice(0, 150),
      depth: config.depth || 0,
    });

    // Create a fresh ToolRegistry for the sub-agent (inherits from parent)
    const subRegistry = new ToolRegistry();
    const subDirectory = directory; // Share A2A directory

    // Build the sub-agent with the same LLM config
    const subResult = await createAgent({
      configPath: config.configPath,
      role: "worker",
      registry: subRegistry,
      directory: subDirectory,
      maxTurns: 30,
      maxContextTokens: maxTokens,
      logDir,
      skillsDir: config.skillsDir,
      projectRoot: config.projectRoot,
      depth: (config.depth || 0) + 1,
    });

    // Register in directory
    directory.register(subResult.handle, "worker");

    // Run the sub-agent with the task
    let output: string;
    try {
      const result = await subResult.agent.invoke(
        { messages: [new HumanMessage(task)] },
        { recursionLimit: 30 },
      );
      const msgs = result.messages || [];
      const last = msgs[msgs.length - 1];
      output = last ? ((last as any).content as string) || "" : "(no output)";
    } catch (e) {
      output = `SUB_AGENT_ERROR: ${(e as Error).message}`;
    }

    // Unregister from directory
    directory.unregister(subResult.id);

    writeLog("spawn_sub_agent_end", {
      id: subResult.id,
      outputLen: output.length,
      depth: config.depth || 0,
    });
    return output;
  }

  // Create the real spawn tool with the handler
  const spawnSubAgentTool = createSpawnSubAgentTool(spawnHandler);

  // Complete task tool — signals the agent to stop
  const completeTaskTool = tool(
    async ({ summary }) => `TASK_COMPLETE: ${summary}`,
    {
      name: "complete_task",
      description:
        "任务完成时调用此工具。调用后必须直接输出文本结果，不要再调用其他工具。传入任务摘要。",
      schema: z.object({ summary: z.string().describe("任务完成摘要") }),
    },
  );

  // Dynamic tool registration tools
  const registerToolsTool = createRegisterToolsTool(registry);
  const unregisterToolsTool = createUnregisterToolsTool(registry);

  // MCP tools
  const mcpRegisterTool = createMcpRegisterTool(async (mcpConfig) => {
    const toolNames = await registerMcpServer(mcpConfig);
    // Register each MCP tool in the ToolRegistry with mcp_ prefix
    for (const name of toolNames) {
      const mcpToolName = `mcp_${name}`;
      registry.addLazy(mcpToolName, async () => {
        const { tool: langchainTool } = await import("@langchain/core/tools");
        return langchainTool(
          async (args: Record<string, unknown>) => callMcpTool(name, args),
          {
            name: mcpToolName,
            description: `MCP tool: ${name}`,
            schema: z.object({}).passthrough(),
          },
        );
      });
    }
    // Auto-register them for immediate use
    const prefixed = toolNames.map((n) => `mcp_${n}`);
    await registry.register(prefixed);
    return [...toolNames, ...prefixed];
  });

  const mcpCallTool = createMcpCallTool(async (toolName, args) => {
    // Strip mcp_ prefix if present, then call MCP
    const actualName = toolName.startsWith("mcp_")
      ? toolName.slice(4)
      : toolName;
    return callMcpTool(actualName, args);
  });

  // Register all tools
  const includeSpawn = (config.depth || 0) < 3;
  const allTools: StructuredTool[] = [
    ...BASE_TOOLS,
    ...(includeSpawn ? [spawnSubAgentTool] : []),
    registerToolsTool,
    unregisterToolsTool,
    mcpRegisterTool,
    mcpCallTool,
    contextInfoTool,
    compressContextTool,
    completeTaskTool,
  ];
  for (const t of allTools) {
    registry.addActive(t);
  }

  // Build tool node
  const toolNode = new ToolNode(registry.getActiveTools());

  // Custom agent node with context check
  async function agentNode(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    messageBox.current = messages.map((m) => ({
      role: m.getType?.() ?? "unknown",
      content: "content" in m ? (m as any).content : "",
    }));

    writeLog("agent_turn", {
      msgCount: messages.length,
      depth: config.depth || 0,
    });

    // Bind tools dynamically (supports register/unregister at runtime)
    const currentTools = registry.getActiveTools();
    const llmWithTools = llm.bindTools(currentTools);

    // Build dynamic system prompt
    const skillsDir =
      config.skillsDir || process.env.SKILL_SCRIPTS_DIR || process.cwd();
    const projectRoot =
      config.projectRoot || process.env.PROJECT_ROOT || process.cwd();
    const systemPrompt = buildSystemPrompt(
      currentTools.map((t) => t.name),
      skillsDir,
      projectRoot,
    );

    const systemMsg = new SystemMessage(systemPrompt);
    const allMessages = [systemMsg, ...messages];

    try {
      const response = await llmWithTools.invoke(allMessages);

      // Check if LLM returned tool calls
      const toolCalls = (response as any).tool_calls;
      writeLog("llm_response", {
        content: (response.content as string)?.slice(0, 200) || "",
        toolCalls: toolCalls?.length || 0,
        toolNames: toolCalls?.map((tc: any) => tc.name) || [],
      });

      return { messages: [response] };
    } catch (e) {
      writeLog("llm_error", { error: (e as Error).message });
      return {
        messages: [
          new AIMessage(
            `Error: ${(e as Error).message}. Please try a different approach or report the issue.`,
          ),
        ],
      };
    }
  }

  // Route: if last message has tool_calls → tools, otherwise → END
  function shouldContinue(
    state: typeof MessagesAnnotation.State,
  ): "tools" | "__end__" {
    const lastMsg = state.messages[state.messages.length - 1];
    const toolCalls = (lastMsg as any).tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      return "tools";
    }
    // No tool calls → agent is done
    writeLog("agent_done", {
      content: ((lastMsg as any).content as string)?.slice(0, 200) || "",
    });
    return "__end__";
  }

  // Build graph
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  const compiledAgent = graph.compile();

  // AgentHandle for A2A communication
  const handle: AgentHandle = {
    id,
    role: config.role,
    async receive(message: string, _fromId: string): Promise<string> {
      try {
        const result = await compiledAgent.invoke(
          { messages: [new HumanMessage(message)] },
          { recursionLimit: maxTurns },
        );
        const msgs = result.messages || [];
        const last = msgs[msgs.length - 1];
        return last ? (last.content as string) || "" : "";
      } catch (e) {
        return `ERROR: ${(e as Error).message}`;
      }
    },
  };

  directory.register(handle, config.role);
  return { agent: compiledAgent, id, handle };
}
