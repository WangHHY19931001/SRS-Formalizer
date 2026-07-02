/**
 * tools.ts — Agent tools for skill debugging
 *
 * Tools available to LLM-driven orchestrator and worker agents.
 * Each tool is a function that the LLM can call via OpenAI function calling.
 *
 * Tool set:
 *   1. read_file       — 读取文件
 *   2. write_file      — 写入文件
 *   3. edit_file       — 改写文件（精确字符串替换）
 *   4. search_in_file  — 在文件内搜索（正则/关键字）
 *   5. run_command     — Shell 执行，捕获 stdout + stderr
 *   6. web_search      — 联网搜索 (DuckDuckGo/no-API-key)
 *   7. validate_output — 校验产物格式
 *   8. list_directory  — 列目录
 *   9. check_file_exists — 检查文件存在
 *  10. record_observation — 记录观测
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { registerMcpServer, callMcpTool } from './mcp.js';

const SCRIPTS_DIR = path.resolve('.claude/skills/srs-formalizer/scripts');
const WEB_SEARCH_URL = process.env.WEB_SEARCH_URL || 'http://localhost:3000';

// ===================== Tool Definitions =====================

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: '读取文件内容。用于阅读 SKILL.md、编排者提示词、分片索引、输出文件等。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（绝对或相对）' },
          max_lines: { type: 'integer', description: '最大读取行数（默认 100）' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: '创建或覆盖写入文件。用于写入测试输出、报告、配置文件等。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: '精确替换文件中的字符串。找到 old_string 并替换为 new_string。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_string: { type: 'string', description: '要替换的原字符串（必须精确匹配）' },
          new_string: { type: 'string', description: '替换后的新字符串' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_in_file',
      description: '在文件中搜索匹配的行。支持关键字和正则表达式。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          pattern: { type: 'string', description: '搜索模式（关键字或正则表达式）' },
          regex: { type: 'boolean', description: '是否作为正则表达式（默认 false，关键字搜索）' },
          max_results: { type: 'integer', description: '最大返回行数（默认 20）' },
        },
        required: ['path', 'pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: '执行 Shell 命令并捕获标准输出和标准错误。所有 srs-formalizer 命令必须通过 npx tsx index.ts <cmd> 调用。工作目录默认为 scripts/ 目录。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell 命令，如 "npx tsx index.ts init --output /tmp/test/.srs_formalizer"' },
          cwd: { type: 'string', description: '工作目录（默认 scripts/）' },
          timeout_ms: { type: 'integer', description: '超时毫秒（默认 120000）' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: '联网搜索。使用 DuckDuckGo 或本地 open-webSearch 服务（无需 API key）。用于查阅技术文档、API 参考、错误排查。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询' },
          max_results: { type: 'integer', description: '最大结果数（默认 5）' },
          engine: { type: 'string', enum: ['duckduckgo', 'bing', 'baidu'], description: '搜索引擎（默认 duckduckgo）' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'http_request',
      description: '发送 HTTP 请求（GET/POST）并获取响应。用于调用外部 API、读取网页内容、访问 REST 服务。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '请求 URL' },
          method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP 方法（默认 GET）' },
          headers: { type: 'string', description: 'JSON 格式的请求头，如 \'{"Content-Type":"application/json"}\'' },
          body: { type: 'string', description: '请求体（POST 时使用）' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'register_mcp_server',
      description: '动态注册 MCP (Model Context Protocol) 服务器。支持 stdio（本地进程）和 HTTP 两种传输方式。注册后即可调用该服务器提供的工具。',
      parameters: {
        type: 'object',
        properties: {
          transport: { type: 'string', enum: ['stdio', 'http'], description: '传输方式' },
          command: { type: 'string', description: 'stdio: 启动命令，如 "npx @modelcontextprotocol/server-brave-search"' },
          args: { type: 'string', description: 'stdio: 命令行参数（空格分隔），如 "--api-key xxx"' },
          url: { type: 'string', description: 'http: MCP 服务器 URL，如 "http://localhost:3000/mcp"' },
        },
        required: ['transport'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'spawn_sub_agent',
      description: '分派子代理执行 LLM 任务并接收返回结果。用于需求提取、BDD充实、术语提取等需要语义理解的任务。子代理有独立的工具集（文件读写、Shell、搜索等），完成后返回结果文本。',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: '子代理的任务提示词，描述需要完成的工作' },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'validate_output',
      description: '校验流水线产物格式（JSONL/feature/tla/lean/cypher/glossary）。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['jsonl', 'feature', 'tla', 'lean', 'cypher', 'glossary'] },
          file_path: { type: 'string', description: '产物文件路径' },
          workdir: { type: 'string', description: '.srs_formalizer 工作目录路径' },
        },
        required: ['type', 'file_path', 'workdir'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: '列出目录内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_file_exists',
      description: '检查文件或目录是否存在。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'record_observation',
      description: '记录测试观测。用于标记阶段完成、检查结果、发现问题和改进建议。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['stage_complete', 'check_result', 'issue', 'recommendation', 'note'] },
          detail: { type: 'string', description: '详细观测内容' },
          passed: { type: 'boolean', description: '检查是否通过（check_result 类别时使用）' },
        },
        required: ['category', 'detail'],
      },
    },
  },
];

// ===================== Tool Implementations =====================

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    // 1. read_file
    case 'read_file': {
      const p = args.path as string;
      const maxLines = (args.max_lines as number) || 100;
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const lines = content.split('\n');
        const shown = lines.slice(0, maxLines);
        const suffix = lines.length > maxLines ? `\n... (${lines.length - maxLines} more lines, ${content.length} chars total)` : '';
        return shown.join('\n') + suffix;
      } catch (e) { return `ERROR: ${(e as Error).message}`; }
    }

    // 2. write_file
    case 'write_file': {
      const p = args.path as string;
      const content = args.content as string;
      try {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, content, 'utf-8');
        return `OK: wrote ${content.length} chars to ${p}`;
      } catch (e) { return `ERROR: ${(e as Error).message}`; }
    }

    // 3. edit_file
    case 'edit_file': {
      const p = args.path as string;
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;
      try {
        const content = fs.readFileSync(p, 'utf-8');
        if (!content.includes(oldStr)) return `ERROR: old_string not found in ${p}`;
        const replaced = content.replace(oldStr, newStr);
        fs.writeFileSync(p, replaced, 'utf-8');
        return `OK: replaced 1 occurrence in ${p} (${replaced.length} chars)`;
      } catch (e) { return `ERROR: ${(e as Error).message}`; }
    }

    // 4. search_in_file
    case 'search_in_file': {
      const p = args.path as string;
      const pattern = args.pattern as string;
      const isRegex = (args.regex as boolean) || false;
      const maxResults = (args.max_results as number) || 20;
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const lines = content.split('\n');
        const results: string[] = [];
        const re = isRegex ? new RegExp(pattern, 'gi') : null;
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          const line = lines[i]!;
          const match = re ? re.test(line) : line.toLowerCase().includes(pattern.toLowerCase());
          if (match) results.push(`${i + 1}: ${line.slice(0, 200)}`);
        }
        return results.length > 0
          ? `Found ${results.length} matches in ${p}:\n${results.join('\n')}`
          : `No matches for "${pattern}" in ${p}`;
      } catch (e) { return `ERROR: ${(e as Error).message}`; }
    }

    // 5. run_command (shell with stdout+stderr capture)
    case 'run_command': {
      const cmd = args.command as string;
      const cwd = (args.cwd as string) || SCRIPTS_DIR;
      const timeout = (args.timeout_ms as number) || 120000;
      try {
        const stdout = execSync(cmd, { cwd, stdio: 'pipe', timeout, env: { ...process.env }, maxBuffer: 10 * 1024 * 1024 }).toString().trim();
        return stdout || '(empty stdout)';
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string; status?: number };
        const out = err.stdout?.toString().trim() || '';
        const errOut = err.stderr?.toString().trim() || '';
        const parts = [out, errOut ? `STDERR: ${errOut}` : '', `exit code: ${err.status ?? 1}`].filter(Boolean);
        return parts.join('\n') || `ERROR: ${err.message}`;
      }
    }

    // 6a. http_request
    case 'http_request': {
      const url = args.url as string;
      const method = (args.method as string) || 'GET';
      let headers: Record<string, string> = { 'User-Agent': 'srs-formalizer-debug-agent/1.0' };
      try {
        if (args.headers) headers = { ...headers, ...JSON.parse(args.headers as string) };
        const opts: RequestInit = { method, headers, signal: AbortSignal.timeout(30000) };
        if (method === 'POST' && args.body) opts.body = args.body as string;
        const resp = await fetch(url, opts);
        const text = await resp.text();
        return `HTTP ${resp.status}: ${text.slice(0, 2000)}`;
      } catch (e) { return `HTTP ERROR: ${(e as Error).message}`; }
    }

    // 6b. register_mcp_server
    case 'register_mcp_server': {
      const transport = args.transport as string;
      try {
        const cmd = args.command as string | undefined;
        const argsStr = args.args as string | undefined;
        const url = args.url as string | undefined;
        const toolNames = await registerMcpServer({
          transport: transport as 'stdio' | 'http',
          command: cmd,
          args: argsStr ? argsStr.split(/\s+/) : undefined,
          url,
        });
        return `OK: registered ${toolNames.length} MCP tools: ${toolNames.join(', ')}`;
      } catch (e) { return `MCP ERROR: ${(e as Error).message}`; }
    }

    // 7. web_search
    case 'web_search': {
      const query = encodeURIComponent(args.query as string);
      const maxResults = (args.max_results as number) || 5;
      const engine = (args.engine as string) || 'duckduckgo';

      // Try local open-webSearch service first
      if (process.env.WEB_SEARCH_URL || engine !== 'duckduckgo') {
        try {
          const resp = await fetch(`${WEB_SEARCH_URL}/search?q=${query}&engine=${engine}&limit=${maxResults}`, { signal: AbortSignal.timeout(15000) });
          if (resp.ok) {
            const data = await resp.json() as { results?: Array<{ title: string; url: string; snippet: string }> };
            const results = (data.results || []).slice(0, maxResults);
            if (results.length > 0) {
              return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
            }
          }
        } catch { /* fall through to DuckDuckGo HTML */ }
      }

      // Fallback: DuckDuckGo HTML scrape (no API key needed)
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${query}`;
        const resp = await fetch(ddgUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 srs-formalizer-debug-agent/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const html = await resp.text();
        const results: Array<{ title: string; url: string; snippet: string }> = [];

        // Parse DuckDuckGo HTML results
        const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
        const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

        const links: Array<{ title: string; url: string }> = [];
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null && links.length < maxResults) {
          links.push({ url: m[1]!, title: m[2]!.replace(/<[^>]+>/g, '').trim() });
        }

        const snippets: string[] = [];
        while ((m = snippetRe.exec(html)) !== null && snippets.length < maxResults) {
          snippets.push(m[1]!.replace(/<[^>]+>/g, '').trim());
        }

        for (let i = 0; i < Math.min(links.length, snippets.length); i++) {
          results.push({ ...links[i]!, snippet: snippets[i]! });
        }

        if (results.length === 0) return `No results from DuckDuckGo for "${args.query}"`;

        return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
      } catch (e) {
        return `Web search failed: ${(e as Error).message}. Try setting WEB_SEARCH_URL env var to a local open-webSearch instance.`;
      }
    }

    // 7. validate_output
    case 'validate_output': {
      const type = args.type as string;
      const filePath = args.file_path as string;
      const workdir = args.workdir as string;
      const cmdMap: Record<string, string> = {
        jsonl: `npx tsx index.ts validate-jsonl --file ${filePath} --workdir ${workdir}`,
        feature: `npx tsx index.ts validate-bdd --workdir ${workdir}`,
        cypher: `npx tsx index.ts validate-cypher --file ${filePath} --workdir ${workdir}`,
        glossary: `npx tsx index.ts validate-glossary --file ${filePath}`,
        tla: `echo '{"status":"ok","message":"TLA+ needs SANY+TLC (external)"}'`,
        lean: `echo '{"status":"ok","message":"Lean 4 needs lake build (external)"}'`,
      };
      try {
        return execSync(cmdMap[type] || 'echo error', { cwd: SCRIPTS_DIR, stdio: 'pipe', timeout: 30000, env: { ...process.env } }).toString().trim();
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer };
        return err.stdout?.toString().trim() || err.stderr?.toString().trim() || 'ERROR';
      }
    }

    // 8. list_directory
    case 'list_directory': {
      try {
        const entries = fs.readdirSync(args.path as string, { withFileTypes: true });
        return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
      } catch (e) { return `ERROR: ${(e as Error).message}`; }
    }

    // 9. check_file_exists
    case 'check_file_exists': {
      try {
        const exists = fs.existsSync(args.path as string);
        if (exists) {
          const stat = fs.statSync(args.path as string);
          return `EXISTS (${stat.isDirectory() ? 'directory' : 'file'}, ${stat.size} bytes)`;
        }
        return 'NOT FOUND';
      } catch (e) { return `ERROR: ${(e as Error).message}`; }
    }

    // 10. record_observation
    case 'record_observation': {
      const cat = args.category as string;
      const detail = args.detail as string;
      const passed = args.passed;
      const icon = passed === true ? '✅' : passed === false ? '❌' : '';
      return `OBSERVED [${cat}] ${icon} ${detail}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
