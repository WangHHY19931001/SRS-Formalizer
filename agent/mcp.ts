/**
 * mcp.ts — MCP (Model Context Protocol) client for dynamic tool registration
 *
 * Supports:
 *   - stdio transport (spawn a local MCP server process)
 *   - HTTP/SSE transport (connect to remote MCP server)
 *   - Dynamic tool discovery and invocation
 *
 * Based on MCP spec: https://spec.modelcontextprotocol.io/
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';

// ===================== Types =====================

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface McpServerConfig {
  transport: 'stdio' | 'http';
  command?: string;       // for stdio: e.g. "npx @modelcontextprotocol/server-xxx"
  args?: string[];        // additional args
  url?: string;           // for http: e.g. "http://localhost:3000/mcp"
}

// ===================== MCP Client =====================

export class McpClient {
  private config: McpServerConfig;
  private process: ChildProcess | null = null;
  private tools: McpToolDef[] = [];
  private connected = false;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = '';

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  async connect(): Promise<McpToolDef[]> {
    if (this.config.transport === 'stdio') {
      return this.connectStdio();
    }
    return this.connectHttp();
  }

  private connectStdio(): Promise<McpToolDef[]> {
    return new Promise((resolve, reject) => {
      const cmd = this.config.command!;
      const args = this.config.args || [];
      this.process = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      // Prevent EPIPE crashes when process exits early
      this.process.stdin!.on('error', () => {
        // stdin closed (process exited) — ignore
      });

      this.process.stdout!.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.parseMessages();
      });

      this.process.stderr!.on('data', (_chunk: Buffer) => {
        // MCP servers may log to stderr — not necessarily errors
      });

      this.process.on('error', (err) => {
        this.connected = false;
        reject(err);
      });
      this.process.on('exit', (code) => {
        this.connected = false;
        if (!this.connected) {
          // Process exited before initialization — reject pending
          for (const [_id, { reject: r }] of this.pending) {
            r(new Error(`MCP process exited with code ${code} before response`));
          }
          this.pending.clear();
        }
      });

      // Initialize MCP session
      this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'srs-formalizer-debug-agent', version: '1.0' },
      }).then(() => {
        // Discover tools
        return this.sendRequest('tools/list', {});
      }).then((result: unknown) => {
        const r = result as { tools?: McpToolDef[] };
        this.tools = r.tools || [];
        this.connected = true;
        resolve(this.tools);
      }).catch(reject);
    });
  }

  private async connectHttp(): Promise<McpToolDef[]> {
    // Simplified: fetch tools list from HTTP endpoint
    const resp = await fetch(`${this.config.url}/tools/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    });
    const data = await resp.json() as { result?: { tools?: McpToolDef[] } };
    this.tools = data.result?.tools || [];
    this.connected = true;
    return this.tools;
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n';
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (this.process && this.process.stdin) {
        try {
          this.process.stdin.write(msg);
        } catch (e) {
          this.pending.delete(id);
          reject(new Error(`MCP process write failed (process may have exited): ${(e as Error).message}`));
          return;
        }
      } else {
        this.pending.delete(id);
        reject(new Error('MCP process not available'));
        return;
      }
      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private parseMessages() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            resolve({ error: msg.error });
          } else {
            resolve(msg.result);
          }
        }
      } catch { /* skip corrupt lines */ }
    }
  }

  /**
   * Call an MCP tool by name.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.config.transport === 'http') {
      const resp = await fetch(`${this.config.url}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: ++this.requestId }),
      });
      const data = await resp.json() as { result?: { content?: Array<{ type: string; text?: string }> } };
      const contents = data.result?.content || [];
      return contents.map(c => c.text || '').join('\n');
    }

    const result = await this.sendRequest('tools/call', { name, arguments: args });
    const r = result as { content?: Array<{ type: string; text?: string }>; error?: unknown };
    if (r.error) return `MCP Error: ${JSON.stringify(r.error)}`;
    return (r.content || []).map(c => c.text || '').join('\n');
  }

  getTools(): McpToolDef[] { return this.tools; }

  disconnect() {
    if (this.process) { this.process.kill(); this.process = null; }
    this.connected = false;
  }
}

// ===================== Registry =====================

const mcpClients = new Map<string, McpClient>();

/**
 * Register an MCP server from a config file or URL.
 * Returns the discovered tool names.
 */
export async function registerMcpServer(config: McpServerConfig): Promise<string[]> {
  const key = config.url || config.command || `mcp-${mcpClients.size}`;
  const client = new McpClient(config);
  const tools = await client.connect();
  mcpClients.set(key, client);
  return tools.map(t => t.name);
}

/**
 * Call a tool on any registered MCP server.
 */
export async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  for (const [, client] of mcpClients) {
    const tools = client.getTools();
    if (tools.some(t => t.name === toolName)) {
      return client.callTool(toolName, args);
    }
  }
  throw new Error(`MCP tool "${toolName}" not found on any registered server`);
}

/**
 * Cleanup all MCP connections.
 */
export function disconnectAllMcp() {
  for (const [, client] of mcpClients) client.disconnect();
  mcpClients.clear();
}
