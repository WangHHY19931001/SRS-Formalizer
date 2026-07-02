/**
 * orchestrator.ts — LLM-driven skill debugging orchestrator
 *
 * This agent:
 *   1. Reads SKILL.md to understand the pipeline
 *   2. Follows orchestrator prompts stage by stage
 *   3. Uses tools (CLI, file, validate) to execute steps
 *   4. Records every action via Tracer
 *
 * The agent's behavior is NOT hardcoded — the LLM decides what to do
 * based on what it reads from SKILL.md and orchestrator prompts.
 */

import OpenAI from 'openai';
import { Tracer } from './tracer.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';
import type { LlmConfig } from '../.claude/skills/srs-formalizer/scripts/lib/llm-client.js';

// ===================== System Prompt =====================

const ORCHESTRATOR_SYSTEM = `你是 srs-formalizer 技能的调测编排者。你的任务是系统性地测试整个技能。

## 你的能力
你可以使用以下工具：
- read_file: 读取 SKILL.md、编排者提示词、分片索引、输出文件
- run_command: 运行 srs-formalizer CLI 命令（必须通过 npx tsx index.ts <cmd>）
- validate_output: 校验流水线产物（JSONL/feature/tla/lean/cypher/glossary）
- list_directory: 列出目录内容
- check_file_exists: 检查文件是否存在
- record_observation: 记录测试观测

## 你的工作流程
1. 先读取 SKILL.md 了解技能结构和命令
2. 按阶段 (S1→S2→S3→S4→S5→S6) 逐步测试
3. 每个阶段：
   a. 读取对应的编排者提示词 (prompts/orchestrator_stage_S*.md)
   b. 按照提示词中的命令执行
   c. 验证产物
   d. 用 record_observation 记录结果
4. 发现任何问题时，详细记录

## 规则
- init 命令使用 --output（不是 --workdir）
- 所有命令必须通过 npx tsx index.ts 调用
- 工作目录必须以 .srs_formalizer 结尾
- 测试工作目录使用 /tmp/srs-debug-<timestamp>/.srs_formalizer

开始前先读取 SKILL.md 了解技能全貌。`;

// ===================== Orchestrator =====================

export class OrchestratorAgent {
  private client: OpenAI;
  private model: string;
  tracer: Tracer;
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  constructor(config: LlmConfig, tracer?: Tracer) {
    this.client = new OpenAI({ baseURL: config.baseURL, apiKey: config.key });
    this.model = config.name;
    this.tracer = tracer || new Tracer();
    this.messages = [{ role: 'system', content: ORCHESTRATOR_SYSTEM }];
  }

  async run(workdir: string): Promise<{ passed: boolean; observations: string[] }> {
    this.tracer.stageEnter('orchestrator', 'START');
    this.tracer.log('agent_start', 'orchestrator', { workdir });

    let turn = 0;
    const maxTurns = 50;
    const observations: string[] = [];

    while (turn < maxTurns) {
      turn++;
      this.tracer.llmRequest('orchestrator', this.messages, TOOL_DEFINITIONS);

      const resp = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: TOOL_DEFINITIONS as OpenAI.Chat.Completions.ChatCompletionTool[],
        tool_choice: 'auto',
        max_tokens: 4096,
        temperature: 0.1,
      });

      const choice = resp.choices[0]!;
      const msg = choice.message;

      // Record reasoning if present
      const reasoning = (msg as Record<string, unknown>).reasoning || (msg as Record<string, unknown>).reasoning_content;
      const content = msg.content || (reasoning as string) || '';

      this.tracer.llmResponse('orchestrator', content,
        msg.tool_calls?.map(t => ({ name: t.function.name, args: t.function.arguments })),
      );

      // If no tool calls, agent is done thinking
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // Check if done
        if (content.includes('DONE') || content.includes('完成') || content.includes('FINISHED')) {
          this.tracer.log('agent_end', 'orchestrator', { turns: turn, status: 'completed' });
          break;
        }
        // Continue conversation
        this.messages.push({ role: 'assistant', content });
        this.messages.push({ role: 'user', content: '继续测试下一个阶段，或输出 DONE 结束。' });
        continue;
      }

      // Execute tool calls
      const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(tc.function.arguments); } catch { /* keep empty */ }

        this.tracer.toolCall('orchestrator', toolName, toolArgs);
        const t0 = Date.now();
        const result = await executeTool(toolName, toolArgs);
        const duration = Date.now() - t0;
        this.tracer.toolResult('orchestrator', toolName, result, duration);

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
      this.messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
      this.messages.push(...toolResults);
    }

    if (turn >= maxTurns) {
      this.tracer.error('orchestrator', 'max_turns', `Reached ${maxTurns} turns`);
    }

    const report = this.tracer.report();
    const passed = report.summary.error_count === 0;

    return { passed, observations };
  }
}
