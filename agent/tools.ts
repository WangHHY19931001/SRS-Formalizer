/**
 * tools.ts — Custom tools not provided by deepagentsjs
 *
 * deepagentsjs provides (via createDeepAgent built-in middleware):
 *   - Filesystem: read_file, write_file, edit_file, ls, glob, grep
 *   - Sub-agents: task (spawn with isolated context)
 *   - Planning: write_todos
 *   - Context: memory middleware
 *
 * We add these custom tools:
 *   - run_command: shell execution via execSync
 *   - web_search: DuckDuckGo web search (no API key)
 *   - http_request: HTTP GET/POST
 *   - MCP: register_mcp_server, call_mcp_tool (factories)
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { execSync } from "node:child_process";

// ==================== run_command ====================

export const runCommandTool = tool(
  async ({ command, cwd, timeoutMs = 120000 }) => {
    const workDir = cwd || process.env.SKILL_SCRIPTS_DIR || process.cwd();
    try {
      const stdout = execSync(command, {
        cwd: workDir,
        stdio: "pipe",
        timeout: timeoutMs,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024,
      })
        .toString()
        .trim();
      return stdout || "(empty stdout)";
    } catch (e: unknown) {
      const err = e as {
        stdout?: Buffer;
        stderr?: Buffer;
        message?: string;
        status?: number;
      };
      return (
        [
          err.stdout?.toString().trim(),
          err.stderr?.toString().trim()
            ? `STDERR: ${err.stderr.toString().trim()}`
            : "",
          `exit: ${err.status ?? 1}`,
        ]
          .filter(Boolean)
          .join("\n") || `ERROR: ${err.message}`
      );
    }
  },
  {
    name: "run_command",
    description: "执行 Shell 命令并捕获 stdout 和 stderr",
    schema: z.object({
      command: z.string().describe("Shell 命令"),
      cwd: z.string().optional().describe("工作目录"),
      timeoutMs: z.number().optional().default(120000).describe("超时毫秒"),
    }),
  },
);

// ==================== web_search ====================

export const webSearchTool = tool(
  async ({ query, maxResults = 5 }) => {
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(ddgUrl, {
        headers: { "User-Agent": "Mozilla/5.0 debug-agent/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      const html = await resp.text();

      const links: { title: string; url: string }[] = [];
      const linkRe =
        /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(html)) && links.length < maxResults) {
        links.push({ url: m[1]!, title: m[2]!.replace(/<[^>]+>/g, "").trim() });
      }

      if (links.length === 0) return `No results for "${query}"`;
      return links
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`)
        .join("\n\n");
    } catch (e) {
      return `Search failed: ${(e as Error).message}`;
    }
  },
  {
    name: "web_search",
    description: "联网搜索（DuckDuckGo，无需 API key）",
    schema: z.object({
      query: z.string().describe("搜索查询"),
      maxResults: z.number().optional().default(5),
    }),
  },
);

// ==================== http_request ====================

export const httpRequestTool = tool(
  async ({ url, method = "GET", headers: hdrStr, body }) => {
    try {
      let headers: Record<string, string> = { "User-Agent": "debug-agent/1.0" };
      if (hdrStr) headers = { ...headers, ...JSON.parse(hdrStr) };
      const opts: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(30000),
      };
      if (method === "POST" && body) opts.body = body;
      const resp = await fetch(url, opts);
      return `HTTP ${resp.status}: ${(await resp.text()).slice(0, 2000)}`;
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
  },
  {
    name: "http_request",
    description: "发送 HTTP 请求",
    schema: z.object({
      url: z.string().describe("请求 URL"),
      method: z.enum(["GET", "POST"]).optional().default("GET"),
      headers: z.string().optional().describe("JSON 格式的请求头"),
      body: z.string().optional().describe("请求体"),
    }),
  },
);

// ==================== MCP factories ====================

/** Create a register_mcp_server tool bound to a handler. */
export function createMcpRegisterTool(
  mcpRegister: (config: {
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
  }) => Promise<string[]>,
) {
  return tool(
    async ({ transport, command, args, url }) => {
      try {
        const toolNames = await mcpRegister({ transport, command, args, url });
        return `MCP 服务器已注册。新增工具 (${toolNames.length}): ${toolNames.join(", ")}`;
      } catch (e) {
        return `MCP 注册失败: ${(e as Error).message}`;
      }
    },
    {
      name: "register_mcp_server",
      description:
        "动态注册 MCP (Model Context Protocol) 服务器。支持 stdio（本地进程）和 HTTP 两种传输方式。",
      schema: z.object({
        transport: z.enum(["stdio", "http"]).describe("传输方式"),
        command: z.string().optional().describe("stdio: 启动命令"),
        args: z.array(z.string()).optional().describe("stdio: 命令行参数"),
        url: z.string().optional().describe("http: MCP 服务器 URL"),
      }),
    },
  );
}

/** Create a call_mcp_tool tool bound to a handler. */
export function createMcpCallTool(
  mcpCall: (toolName: string, args: Record<string, unknown>) => Promise<string>,
) {
  return tool(
    async ({ toolName, args }) => {
      try {
        const result = await mcpCall(toolName, args || {});
        return result;
      } catch (e) {
        return `MCP 调用失败 [${toolName}]: ${(e as Error).message}`;
      }
    },
    {
      name: "call_mcp_tool",
      description:
        "调用已注册 MCP 服务器上的工具。用 register_mcp_server 注册后使用（工具名以 mcp_ 前缀开头）。",
      schema: z.object({
        toolName: z
          .string()
          .describe(
            "MCP 工具名称（如 mcp_search-tickets），从 register_mcp_server 返回结果中获取",
          ),
        args: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("工具参数 JSON 对象"),
      }),
    },
  );
}
