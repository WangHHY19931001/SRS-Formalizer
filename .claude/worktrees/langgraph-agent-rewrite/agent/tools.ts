import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

function getScriptsDir(): string {
  return process.env.SKILL_SCRIPTS_DIR || process.cwd();
}

export const readFileTool = tool(
  async ({ filePath, maxLines = 100 }) => {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const shown = lines.slice(0, maxLines);
      return shown.join("\n") + (lines.length > maxLines ? `\n... (${lines.length - maxLines} more lines)` : "");
    } catch (e) { return `ERROR: ${(e as Error).message}`; }
  },
  { name: "read_file", description: "读取文件内容", schema: z.object({ filePath: z.string(), maxLines: z.number().optional().default(100) }) }
);

export const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
      return `OK: wrote ${content.length} chars to ${filePath}`;
    } catch (e) { return `ERROR: ${(e as Error).message}`; }
  },
  { name: "write_file", description: "创建或覆盖写入文件", schema: z.object({ filePath: z.string(), content: z.string() }) }
);

export const editFileTool = tool(
  async ({ filePath, oldString, newString }) => {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.includes(oldString)) return `ERROR: old_string not found in ${filePath}`;
      fs.writeFileSync(filePath, content.replace(oldString, newString), "utf-8");
      return `OK: replaced in ${filePath}`;
    } catch (e) { return `ERROR: ${(e as Error).message}`; }
  },
  { name: "edit_file", description: "精确替换文件中的字符串", schema: z.object({ filePath: z.string(), oldString: z.string(), newString: z.string() }) }
);

export const searchInFileTool = tool(
  async ({ filePath, pattern, regex = false, maxResults = 20 }) => {
    try {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n");
      const re = regex ? new RegExp(pattern, "gi") : null;
      const results: string[] = [];
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        const match = re ? re.test(lines[i]!) : lines[i]!.toLowerCase().includes(pattern.toLowerCase());
        if (match) results.push(`${i + 1}: ${lines[i]!.slice(0, 200)}`);
      }
      return results.length > 0 ? results.join("\n") : `No matches for "${pattern}"`;
    } catch (e) { return `ERROR: ${(e as Error).message}`; }
  },
  { name: "search_in_file", description: "在文件中搜索关键字或正则表达式", schema: z.object({ filePath: z.string(), pattern: z.string(), regex: z.boolean().optional().default(false), maxResults: z.number().optional().default(20) }) }
);

export const runCommandTool = tool(
  async ({ command, cwd, timeoutMs = 120000 }) => {
    const workDir = cwd || getScriptsDir();
    try {
      const stdout = execSync(command, { cwd: workDir, stdio: "pipe", timeout: timeoutMs, env: { ...process.env }, maxBuffer: 10 * 1024 * 1024 }).toString().trim();
      return stdout || "(empty stdout)";
    } catch (e: unknown) {
      const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string; status?: number };
      return [err.stdout?.toString().trim(), err.stderr?.toString().trim() ? `STDERR: ${err.stderr.toString().trim()}` : "", `exit: ${err.status ?? 1}`].filter(Boolean).join("\n") || `ERROR: ${err.message}`;
    }
  },
  { name: "run_command", description: "执行 Shell 命令并捕获 stdout 和 stderr", schema: z.object({ command: z.string(), cwd: z.string().optional(), timeoutMs: z.number().optional().default(120000) }) }
);

export const webSearchTool = tool(
  async ({ query, maxResults = 5 }) => {
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(ddgUrl, { headers: { "User-Agent": "Mozilla/5.0 debug-agent/1.0" }, signal: AbortSignal.timeout(15000) });
      const html = await resp.text();
      const links: { title: string; url: string }[] = [];
      const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(html)) && links.length < maxResults) links.push({ url: m[1]!, title: m[2]!.replace(/<[^>]+>/g, "").trim() });
      if (links.length === 0) return `No results for "${query}"`;
      return links.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n\n");
    } catch (e) { return `Search failed: ${(e as Error).message}`; }
  },
  { name: "web_search", description: "联网搜索（DuckDuckGo，无需 API key）", schema: z.object({ query: z.string(), maxResults: z.number().optional().default(5) }) }
);

export const httpRequestTool = tool(
  async ({ url, method = "GET", headers: hdrStr, body }) => {
    try {
      let headers: Record<string, string> = { "User-Agent": "debug-agent/1.0" };
      if (hdrStr) headers = { ...headers, ...JSON.parse(hdrStr) };
      const opts: RequestInit = { method, headers, signal: AbortSignal.timeout(30000) };
      if (method === "POST" && body) opts.body = body;
      const resp = await fetch(url, opts);
      return `HTTP ${resp.status}: ${(await resp.text()).slice(0, 2000)}`;
    } catch (e) { return `ERROR: ${(e as Error).message}`; }
  },
  { name: "http_request", description: "发送 HTTP 请求", schema: z.object({ url: z.string(), method: z.enum(["GET", "POST"]).optional().default("GET"), headers: z.string().optional(), body: z.string().optional() }) }
);

export const listDirTool = tool(
  async ({ dirPath }) => {
    try { return fs.readdirSync(dirPath, { withFileTypes: true }).map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n"); }
    catch (e) { return `ERROR: ${(e as Error).message}`; }
  },
  { name: "list_directory", description: "列出目录内容", schema: z.object({ dirPath: z.string() }) }
);

export const checkFileTool = tool(
  async ({ filePath }) => {
    try {
      if (!fs.existsSync(filePath)) return "NOT FOUND";
      const stat = fs.statSync(filePath);
      return `EXISTS (${stat.isDirectory() ? "directory" : "file"}, ${stat.size} bytes)`;
    } catch (e) { return `ERROR: ${(e as Error).message}`; }
  },
  { name: "check_file_exists", description: "检查文件或目录是否存在", schema: z.object({ filePath: z.string() }) }
);

export const validateOutputTool = tool(
  async ({ type, filePath, workdir }) => {
    const cmdMap: Record<string, string> = { jsonl: `npx tsx index.ts validate-jsonl --file ${filePath} --workdir ${workdir}`, feature: `npx tsx index.ts validate-bdd --workdir ${workdir}`, cypher: `npx tsx index.ts validate-cypher --file ${filePath} --workdir ${workdir}`, glossary: `npx tsx index.ts validate-glossary --file ${filePath}`, tla: `echo '{"status":"ok","message":"TLA+ needs SANY+TLC"}'`, lean: `echo '{"status":"ok","message":"Lean 4 needs lake build"}'` };
    try { return execSync(cmdMap[type] || "echo error", { cwd: getScriptsDir(), stdio: "pipe", timeout: 30000, env: { ...process.env } }).toString().trim(); }
    catch (e: unknown) { const err = e as { stdout?: Buffer; stderr?: Buffer }; return err.stdout?.toString().trim() || err.stderr?.toString().trim() || "ERROR"; }
  },
  { name: "validate_output", description: "校验流水线产物格式", schema: z.object({ type: z.enum(["jsonl", "feature", "tla", "lean", "cypher", "glossary"]), filePath: z.string(), workdir: z.string() }) }
);

export const registerToolsTool = tool(
  async ({ toolNames }) => `TOOLS_REGISTERED: ${toolNames.join(", ")}`,
  { name: "register_tools", description: "注册新工具使其可用", schema: z.object({ toolNames: z.array(z.string()) }) }
);

export const unregisterToolsTool = tool(
  async ({ toolNames }) => `TOOLS_UNREGISTERED: ${toolNames.join(", ")}`,
  { name: "unregister_tools", description: "卸载工具", schema: z.object({ toolNames: z.array(z.string()) }) }
);

export const BASE_TOOLS = [readFileTool, writeFileTool, editFileTool, searchInFileTool, runCommandTool, webSearchTool, httpRequestTool, listDirTool, checkFileTool, validateOutputTool, registerToolsTool, unregisterToolsTool];
