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
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StructuredTool } from "@langchain/core/tools";
import { ToolRegistry } from "./tool-registry.js";
import { AgentDirectory, type AgentHandle } from "./agent-directory.js";
import { ContextManager, createContextTools } from "./context.js";
import { ALL_TOOLS } from "./tools.js";
import { loadLlmConfig } from "./llm-config.js";
import * as fs from "node:fs";

let agentIdCounter = 0;

// ===================== Dynamic System Prompt =====================

const WORK_TABOOS = [
  "禁止修改 .git 目录和已提交的代码文件（除非任务明确要求修改 agent 自己的产物）",
  "禁止执行 rm -rf、fork bomb 等危险命令",
  "禁止在超过 5 次工具调用后仍未取得进展时继续循环——应停止并总结当前状态",
  "禁止输出非中文或非英文的无关内容",
  "禁止在任务完成后继续调用工具——必须直接输出文本总结",
];

function buildSystemPrompt(toolNames: string[], skillsDir: string, projectRoot: string): string {
  const toolList = toolNames.map(n => `  - ${n}`).join("\n");
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
}

// ===================== createAgent =====================

export async function createAgent(config: AgentConfig): Promise<{
  agent: ReturnType<typeof StateGraph.prototype.compile>;
  id: string;
  handle: AgentHandle;
}> {
  const id = `${config.role}-${Date.now()}-${++agentIdCounter}`;
  const llmConfig = loadLlmConfig(config.configPath);
  const maxTokens = config.maxContextTokens || llmConfig["max-model-len"] || 131072;
  const maxTurns = config.maxTurns || 50;
  const logDir = config.logDir || "/tmp/srs-agent-logs";

  // Ensure log dir exists
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = `${logDir}/${id}.jsonl`;

  function writeLog(type: string, data: Record<string, unknown>) {
    const line = JSON.stringify({ ts: new Date().toISOString(), type, agentId: id, ...data });
    try { fs.appendFileSync(logPath, line + "\n", "utf-8"); } catch { /* silent */ }
  }

  const llm = new ChatOpenAI({
    model: llmConfig.name,
    temperature: 0.1,
    configuration: { baseURL: llmConfig.baseURL, apiKey: llmConfig.key },
  });

  // Tool registry & agent directory
  const registry = config.registry || new ToolRegistry();
  const directory = config.directory || new AgentDirectory();

  // Context manager
  const openaiClient = new (await import("openai")).default({
    baseURL: llmConfig.baseURL,
    apiKey: llmConfig.key,
  });
  const ctxManager = new ContextManager(openaiClient, llmConfig.name, maxTokens, 2);

  // Context tracking
  const messageBox: { current: Array<{ role: string; content: unknown }> } = { current: [] };

  const { contextInfoTool, compressContextTool } = createContextTools(
    ctxManager,
    () => messageBox.current as any,
  );

  // Complete task tool — signals the agent to stop
  const completeTaskTool = tool(
    async ({ summary }) => `TASK_COMPLETE: ${summary}`,
    {
      name: "complete_task",
      description: "任务完成时调用此工具。调用后必须直接输出文本结果，不要再调用其他工具。传入任务摘要。",
      schema: z.object({ summary: z.string().describe("任务完成摘要") }),
    },
  );

  // Register all tools
  const allTools: StructuredTool[] = [...ALL_TOOLS, contextInfoTool, compressContextTool, completeTaskTool];
  for (const t of allTools) {
    registry.addActive(t);
  }

  // Build tool node
  const toolNode = new ToolNode(registry.getActiveTools());

  // Custom agent node with context check
  async function agentNode(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    messageBox.current = messages.map(m => ({
      role: m.getType?.() ?? "unknown",
      content: "content" in m ? (m as any).content : "",
    }));

    writeLog("agent_turn", { msgCount: messages.length });

    // Bind tools dynamically (supports register/unregister at runtime)
    const currentTools = registry.getActiveTools();
    const llmWithTools = llm.bindTools(currentTools);

    // Build dynamic system prompt
    const skillsDir = config.skillsDir || process.env.SKILL_SCRIPTS_DIR || process.cwd();
    const projectRoot = config.projectRoot || process.env.PROJECT_ROOT || process.cwd();
    const systemPrompt = buildSystemPrompt(
      currentTools.map(t => t.name),
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
      return { messages: [new AIMessage(`Error: ${(e as Error).message}. Please try a different approach or report the issue.`)] };
    }
  }

  // Route: if last message has tool_calls → tools, otherwise → END
  function shouldContinue(state: typeof MessagesAnnotation.State): "tools" | "__end__" {
    const lastMsg = state.messages[state.messages.length - 1];
    const toolCalls = (lastMsg as any).tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      return "tools";
    }
    // No tool calls → agent is done
    writeLog("agent_done", { content: ((lastMsg as any).content as string)?.slice(0, 200) || "" });
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
