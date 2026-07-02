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
import { Tracer, type TraceEventType } from './tracer.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

// ===================== System Prompts =====================

const ORCHESTRATOR_PROMPT = `你是 srs-formalizer 技能的调测编排者。

## 你的能力
你拥有文件读写、Shell 执行、联网搜索、子代理分派等工具。
使用工具来系统性地测试 srs-formalizer 技能的每个部分。

## 工作流程
1. 读取 .claude/skills/srs-formalizer/SKILL.md 了解技能全貌
2. 按阶段逐步测试：S1→S2→S3→S4→S5→S6
3. 每个阶段读取对应的编排者提示词 (prompts/orchestrator_stage_S*.md)
4. 按提示词执行命令，验证产物
5. 对于需要 LLM 处理的任务（需求提取、BDD生成、术语提取等），
   使用 spawn_sub_agent 分派子代理并行处理
6. 用 record_observation 记录所有观测

## 规则
- init 使用 --output，其他命令使用 --workdir
- 所有命令必须通过 npx tsx index.ts 调用
- 测试工作目录: /tmp/srs-debug-<timestamp>/.srs_formalizer

先读取 SKILL.md。`;

const WORKER_PROMPT = `你是 srs-formalizer 的工作子代理。接收任务提示词，使用工具完成任务，返回结果。

## 规则
- 只输出任务结果，不要额外解释
- 先读任务要求，再用工具执行
- 需要联网搜索时使用 web_search 工具`;

// ===================== Config =====================

export interface AgentConfig {
  model: string;
  baseURL: string;
  apiKey: string;
  maxTurns?: number;
  role: 'orchestrator' | 'worker';
  tracer?: Tracer;
}

// ===================== Agent =====================

export class Agent {
  private client: OpenAI;
  private model: string;
  private maxTurns: number;
  private role: 'orchestrator' | 'worker';
  tracer: Tracer;
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  private tools: typeof TOOL_DEFINITIONS;

  constructor(config: AgentConfig) {
    this.client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });
    this.model = config.model;
    this.maxTurns = config.maxTurns || 50;
    this.role = config.role;
    this.tracer = config.tracer || new Tracer();

    const systemPrompt = config.role === 'orchestrator' ? ORCHESTRATOR_PROMPT : WORKER_PROMPT;
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
      baseURL: (this.client as unknown as { baseURL: string }).baseURL || '',
      apiKey: (this.client as unknown as { apiKey: string }).apiKey || '',
      maxTurns: 15,
      role: 'worker',
      tracer: this.tracer, // Share tracer for unified trace
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
    const observations: string[] = [];

    while (turn < this.maxTurns) {
      turn++;
      const agentId = this.role;

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

        // Special handling: spawn_sub_agent creates a recursive agent
        if (toolName === 'spawn_sub_agent') {
          const subPrompt = (toolArgs.prompt as string) || (toolArgs.task as string) || '';
          result = await this.spawnSubAgent(subPrompt);
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
