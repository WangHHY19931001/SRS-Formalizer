/**
 * agent.ts — Unified LLM-driven agent with recursive sub-agent spawning
 *
 * A single Agent class that can:
 *   1. Act as ORCHESTRATOR: read SKILL.md, follow prompts, dispatch sub-agents
 *   2. Act as WORKER: receive a task prompt, execute with tools, return result
 *   3. Spawn SUB-AGENTS: recursively create child agents for parallel work
 *
 * Tools: read_file, write_file, edit_file, search_in_file, run_command,
 *        web_search, spawn_sub_agent, validate_output, list_directory,
 *        check_file_exists, record_observation
 */

import OpenAI from 'openai';
import { Tracer } from './tracer.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';
import { ContextManager } from './context.js';

// ===================== System Prompts =====================

const BASE_SYSTEM_PROMPT = `你是技能调测代理。你拥有文件读写、Shell 执行、联网搜索、子代理分派等工具。
严格遵循用户提供的工作提示词中的指令。工作提示词包含：技能路径、工作目录、测试范围、规则约束。`;

const WORKER_PROMPT = `你是工作子代理。接收任务，使用工具完成，返回结果。只输出结果，不解释。`;

// ===================== Config =====================

export interface AgentConfig {
  model: string;
  baseURL: string;
  apiKey: string;
  maxTurns?: number;
  maxContextTokens?: number;
  role: 'orchestrator' | 'worker';
  tracer?: Tracer;
}

// ===================== Agent =====================

export class Agent {
  private client: OpenAI;
  private model: string;
  private baseURL: string;
  private apiKey: string;
  private maxTurns: number;
  private role: 'orchestrator' | 'worker';
  private ctx: ContextManager;
  tracer: Tracer;
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  private tools: typeof TOOL_DEFINITIONS;

  constructor(config: AgentConfig) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });
    this.model = config.model;
    this.maxTurns = config.maxTurns || 50;
    this.role = config.role;
    this.tracer = config.tracer || new Tracer();
    this.ctx = new ContextManager(this.client, this.model, config.maxContextTokens || 131072, 2);

    const systemPrompt = config.role === 'orchestrator' ? BASE_SYSTEM_PROMPT : WORKER_PROMPT;
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.tools = TOOL_DEFINITIONS;
  }

  /**
   * Spawn a sub-agent with a custom task prompt and return its final output.
   * This is called internally by the spawn_sub_agent tool.
   */
  private async spawnSubAgent(taskPrompt: string): Promise<string> {
    const subAgent = new Agent({
      model: this.model,
      baseURL: this.baseURL,
      apiKey: this.apiKey,
      maxTurns: 15,
      role: 'worker',
      tracer: this.tracer,
    });

    // Override system prompt for workers spawned by orchestrator
    subAgent.messages = [
      { role: 'system', content: WORKER_PROMPT },
      { role: 'user', content: taskPrompt },
    ];

    this.tracer.log('agent_start', 'worker', { task: taskPrompt.slice(0, 200) });
    const result = await subAgent.run();
    this.tracer.log('agent_end', 'worker', { output_length: result.length });
    return result;
  }

  /**
   * Main agent loop: LLM thinks → calls tools → loop until done.
   * Returns the agent's final text output.
   */
  async run(initialPrompt?: string): Promise<string> {
    if (initialPrompt) {
      this.messages.push({ role: 'user', content: initialPrompt });
    }

    let turn = 0;
    let suggestedCompress = false;
    const observations: string[] = [];

    while (turn < this.maxTurns) {
      turn++;
      const agentId = this.role;

      // Context window management
      const ctxState = this.ctx.check(this.messages);
      if (ctxState.level === 'force') {
        this.tracer.log('compress_context', agentId, { level: 'force', before_pct: ctxState.usage_pct, tokens: ctxState.total_tokens });
        this.messages = await this.ctx.compress(this.messages);
        const afterState = this.ctx.check(this.messages);
        this.tracer.log('compress_context', agentId, { level: 'force', after_pct: afterState.usage_pct, tokens: afterState.total_tokens });
      } else if (ctxState.level === 'suggest' && !suggestedCompress) {
        suggestedCompress = true;
        this.messages.push({
          role: 'user',
          content: `[系统提示] 上下文使用率已达 ${ctxState.usage_pct}%（${ctxState.total_tokens}/${ctxState.maxTokens} tokens）。如果当前任务已完成，请记录观测并继续。如果上下文过长，你可以调用 compress_context 工具来压缩上下文。`,
        });
      }
      // 'allow' level: LLM can voluntarily call compress_context placeholder (handled in tool execution)

      this.tracer.llmRequest(agentId, this.messages, this.tools);

      const resp = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: this.tools as OpenAI.Chat.Completions.ChatCompletionTool[],
        tool_choice: 'auto',
        max_tokens: 4096,
        temperature: 0.1,
      });

      const choice = resp.choices[0]!;
      const msg = choice.message;
      const content = msg.content || '';

      this.tracer.llmResponse(agentId, content,
        msg.tool_calls?.map(t => ({ name: t.function.name, args: t.function.arguments.slice(0, 100) })),
      );

      // No tool calls → agent is done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // If orchestrator has more to say, prompt continuation
        if (this.role === 'orchestrator' && turn < 5 && !content.includes('DONE')) {
          this.messages.push({ role: 'assistant', content });
          this.messages.push({ role: 'user', content: '继续测试。完成后输出 DONE。' });
          continue;
        }
        return content;
      }

      // Execute tool calls (including spawn_sub_agent which may be recursive)
      const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(tc.function.arguments); } catch { /* keep empty */ }

        this.tracer.toolCall(agentId, toolName, toolArgs);
        const t0 = Date.now();

        let result: string;

        // Special handling: tools that need Agent context
        if (toolName === 'spawn_sub_agent') {
          const subPrompt = (toolArgs.task as string) || (toolArgs.prompt as string) || '';
          result = await this.spawnSubAgent(subPrompt);
        } else if (toolName === 'compress_context') {
          // LLM-triggered compression
          this.tracer.toolCall(agentId, 'compress_context', { trigger: 'llm' });
          this.messages = await this.ctx.compress(this.messages);
          const cs = this.ctx.check(this.messages);
          result = `上下文已压缩。使用率: ${cs.usage_pct}% (${cs.total_tokens}/${cs.maxTokens})`;
        } else {
          result = await executeTool(toolName, toolArgs);
        }

        const duration = Date.now() - t0;
        this.tracer.toolResult(agentId, toolName, result, duration);

        if (toolName === 'record_observation') {
          observations.push(result);
        }

        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Add assistant message + tool results to conversation
      this.messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.tool_calls,
      });
      this.messages.push(...toolResults);
    }

    return `Agent stopped after ${this.maxTurns} turns. Observations: ${observations.length}`;
  }
}
