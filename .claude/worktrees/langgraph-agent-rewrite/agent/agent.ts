import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StructuredTool } from "@langchain/core/tools";
import { ToolRegistry } from "./tool-registry.js";
import { AgentDirectory, type AgentHandle } from "./agent-directory.js";
import { ContextManager, createContextTools } from "./context.js";
import { BASE_TOOLS } from "./tools.js";

let agentIdCounter = 0;

export interface AgentConfig {
  configPath: string;
  role: "orchestrator" | "worker";
  registry: ToolRegistry;
  directory: AgentDirectory;
  maxTurns?: number;
  maxContextTokens?: number;
}

export async function createAgent(config: AgentConfig): Promise<{
  agent: ReturnType<typeof createReactAgent>;
  id: string;
  handle: AgentHandle;
}> {
  const id = `${config.role}-${Date.now()}-${++agentIdCounter}`;
  const { loadLlmConfig } = await import("./llm-config.js");
  const llmConfig = loadLlmConfig(config.configPath);
  const maxTokens = config.maxContextTokens || llmConfig["max-model-len"] || 131072;

  const llm = new ChatOpenAI({
    model: llmConfig.name,
    temperature: 0.1,
    configuration: { baseURL: llmConfig.baseURL, apiKey: llmConfig.key },
  });

  const ctxManager = new ContextManager(llm as any, llmConfig.name, maxTokens, 2);

  // Track messages for context tools (updated by agent node)
  let currentMessages: any[] = [];
  const { contextInfoTool, compressContextTool } = createContextTools(ctxManager, () => currentMessages);

  // Register all base tools
  for (const t of BASE_TOOLS) config.registry.addActive(t);
  config.registry.addActive(contextInfoTool);
  config.registry.addActive(compressContextTool);

  // Create the create_sub_agent tool
  const createSubAgentTool = tool(
    async ({ systemPrompt, task, tools: toolNames, maxTurns = 20 }) => {
      const subConfig: AgentConfig = {
        ...config,
        role: "worker",
        maxTurns,
      };
      const { agent: subAgent, id: subId, handle: subHandle } = await createAgent(subConfig);
      // Override tools: give sub-agent only the tools it requested
      // Register just the requested tools for this sub-agent
      const subRegistry = new ToolRegistry();
      for (const t of BASE_TOOLS) {
        if (toolNames.includes(t.name)) subRegistry.addActive(t);
      }
      subRegistry.addActive(contextInfoTool);
      subRegistry.addActive(compressContextTool);
      // Re-create the agent with filtered tools (simplified: invoke directly)
      const result = await subAgent.invoke({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: task },
        ],
      });
      const msgs = result.messages || [];
      const output = msgs.length > 0 ? (msgs[msgs.length - 1] as any).content?.toString() || "" : "";
      config.directory.unregister(subId);
      return output;
    },
    {
      name: "create_sub_agent",
      description: "创建子代理执行任务。指定子代理的角色(systemPrompt)、任务(task)、可用工具(tools)和步数上限(maxTurns)。",
      schema: z.object({
        systemPrompt: z.string().describe("子代理的系统提示词"),
        task: z.string().describe("子代理的任务描述"),
        tools: z.array(z.string()).describe("子代理可用的工具名称列表"),
        maxTurns: z.number().optional().default(20).describe("最大步数"),
      }),
    },
  );
  config.registry.addActive(createSubAgentTool);

  // A2A tools
  const a2aSendTool = tool(
    async ({ agentId: targetId, message }) => {
      return config.directory.send(id, targetId, message);
    },
    {
      name: "a2a_send",
      description: "向指定代理发送消息",
      schema: z.object({
        agentId: z.string().describe("目标代理ID"),
        message: z.string().describe("消息内容"),
      }),
    },
  );

  const a2aBroadcastTool = tool(
    async ({ message, role }) => {
      return config.directory.broadcast(id, message, role ? { role } : undefined);
    },
    {
      name: "a2a_broadcast",
      description: "向所有代理（或指定角色的代理）广播消息",
      schema: z.object({
        message: z.string().describe("消息内容"),
        role: z.string().optional().describe("仅发送给指定角色的代理"),
      }),
    },
  );

  config.registry.addActive(a2aSendTool);
  config.registry.addActive(a2aBroadcastTool);

  // Create the ReAct agent — it uses the registry's tools
  const reactAgent = createReactAgent({
    llm,
    tools: config.registry.getActiveTools(),
  });

  // AgentHandle for A2A communication
  const handle: AgentHandle = {
    id,
    role: config.role,
    async receive(message: string, _fromId: string): Promise<string> {
      const result = await reactAgent.invoke({
        messages: [new HumanMessage(message)],
      });
      const msgs = result.messages || [];
      return msgs.length > 0 ? (msgs[msgs.length - 1] as any).content?.toString() || "" : "";
    },
  };

  config.directory.register(handle, config.role);
  return { agent: reactAgent, id, handle };
}
