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
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
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

  const llm = new ChatOpenAI({
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
  });

  // ===================== AgentHandle =====================

  // deepagents invoke has a complex generic signature; bridge via unknown
  const deepInvoke = agent.invoke as unknown as (
    input: Record<string, unknown>,
    config?: Record<string, unknown>,
  ) => Promise<{ messages?: Array<{ content: unknown }> }>;

  const invoke = (
    input: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<{ messages?: Array<{ content: unknown }> }> =>
    deepInvoke(input, config);

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
