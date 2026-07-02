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

import { createDeepAgent, FilesystemBackend } from "deepagents";
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
import * as path from "node:path";

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
  "并行优先：独立无依赖的任务（如同阶段多个分片提取、多个文件校验）必须使用 task 一次性并行分派多个子代理，禁止串行逐个处理。先 write_todos 规划并行组，再批量 task 执行",
  "串行依赖：有前后依赖的任务（如后续阶段依赖前阶段产物、校验依赖生成）必须串行派遣——等前一个子代理完成并检查产物后再派下一个。流水线阶段之间天然串行",
  "对于 LLM 密集型任务（需求提取、术语表生成、架构分解），必须使用 task 分派子代理执行——禁止手动编写 JSONL 或直接生成大量结构化数据",
  "始终遵循技能 SKILL.md 中的流水线阶段顺序，不要跳步",
  "多级子代理通过文件交接：每个子代理将产物写入文件，主代理读取文件获取结果，不要将大量数据塞入对话上下文",
  "上下文管理（自动估算 token 占用）：40% → 将中间结果写入文件，后续引用文件路径而非内容；60% → 必须压缩已完成的步骤，用文件摘要替代对话历史；75% → 系统自动触发压缩保护",
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

  // Qwen-compatible: strip file content blocks from all messages.
  // Proxy intercepts ALL method calls (invoke, stream, _generate, etc.)
  // because deepagents may call internal methods that bypass invoke().
  function stripFileBlocks(obj: unknown): unknown {
    if (!obj || typeof obj !== "object") return obj;
    // Skip LangChain internal objects (lc_ prefixed, kwargs, etc.)
    if ((obj as Record<string, unknown>).lc !== undefined) return obj;
    if (Array.isArray(obj)) return obj.map(stripFileBlocks);
    const o = obj as Record<string, unknown>;
    if (o.type === "file") {
      const f = o as { file?: { name?: string; data?: unknown } };
      const name = f.file?.name || "file";
      const text = typeof f.file?.data === "string" ? f.file.data.slice(0, 500) : `[${name}]`;
      return { type: "text", text };
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(o)) {
      // Skip LangChain serialization fields to avoid breaking internal wiring
      if (key.startsWith("lc_") || key === "kwargs" || key === "id") {
        result[key] = o[key];
      } else {
        result[key] = stripFileBlocks(o[key]);
      }
    }
    return result;
  }

  const rawLlm = new ChatOpenAI({
    model: llmConfig.name,
    temperature: 0.1,
    configuration: { baseURL: llmConfig.baseURL, apiKey: llmConfig.key },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LLM_METHODS = new Set(["invoke", "stream", "_generate", "_streamResponseChunks"]);
  const llm = new Proxy(rawLlm, {
    get(target, prop, _receiver) {
      const orig = (target as unknown as Record<string, unknown>)[prop as string];
      if (typeof orig === "function" && LLM_METHODS.has(prop as string)) {
        return (...args: unknown[]) => {
          const clean = args.map((a) => stripFileBlocks(a));
          return (orig as (...a: unknown[]) => unknown).apply(target, clean);
        };
      }
      return orig;
    },
  }) as unknown as ChatOpenAI;

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

  // Restrict filesystem access to project root (resolve to absolute path)
  const projectRoot = path.resolve(
    config.projectRoot || process.env.PROJECT_ROOT || process.cwd(),
  );
  const backend = new FilesystemBackend({ rootDir: projectRoot });

  const agent = createDeepAgent({
    model: llm,
    systemPrompt,
    backend,
    tools: [
      runCommandTool,
      webSearchTool,
      httpRequestTool,
      mcpRegisterTool,
      mcpCallTool,
      ...mcpTools,
    ],
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
