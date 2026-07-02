/**
 * tracer.ts — Agent observation & tracing system
 *
 * Records every agent action: tool calls, LLM responses, state transitions.
 * Writes structured trace logs for post-hoc analysis.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type TraceEventType =
  | 'agent_start' | 'agent_end'
  | 'llm_request' | 'llm_response'
  | 'tool_call' | 'tool_result'
  | 'stage_enter' | 'stage_exit'
  | 'check_pass' | 'check_fail'
  | 'error';

export interface TraceEvent {
  timestamp: string;
  type: TraceEventType;
  agent: 'orchestrator' | 'worker';
  data: Record<string, unknown>;
}

export class Tracer {
  private events: TraceEvent[] = [];
  private startTime: number;
  private outputDir: string;

  constructor(outputDir?: string) {
    this.startTime = Date.now();
    this.outputDir = outputDir || '/tmp/srs-agent-traces';
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  log(type: TraceEventType, agent: 'orchestrator' | 'worker', data: Record<string, unknown>) {
    const event: TraceEvent = {
      timestamp: new Date().toISOString(),
      type,
      agent,
      data,
    };
    this.events.push(event);
    // Write immediately for crash-safety
    this.flush();
  }

  llmRequest(agent: 'orchestrator' | 'worker', messages: unknown[], tools?: unknown[]) {
    this.log('llm_request', agent, { message_count: (messages as Array<unknown>).length, tool_count: tools ? (tools as Array<unknown>).length : 0 });
  }

  llmResponse(agent: 'orchestrator' | 'worker', response: string, toolCalls?: unknown[], durationMs?: number) {
    this.log('llm_response', agent, { response_preview: response.slice(0, 200), tool_calls: toolCalls ? (toolCalls as Array<unknown>).length : 0, duration_ms: durationMs });
  }

  toolCall(agent: 'orchestrator' | 'worker', toolName: string, args: Record<string, unknown>) {
    this.log('tool_call', agent, { tool: toolName, args: JSON.stringify(args).slice(0, 200) });
  }

  toolResult(agent: 'orchestrator' | 'worker', toolName: string, result: string, durationMs: number) {
    this.log('tool_result', agent, { tool: toolName, result_preview: result.slice(0, 200), duration_ms: durationMs });
  }

  stageEnter(agent: 'orchestrator' | 'worker', stage: string) {
    this.log('stage_enter', agent, { stage });
  }

  error(agent: 'orchestrator' | 'worker', context: string, error: string) {
    this.log('error', agent, { context, error });
  }

  /**
   * Generate final report from all events.
   */
  report(): { summary: Record<string, unknown>; events: TraceEvent[] } {
    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const errors: TraceEvent[] = [];

    for (const e of this.events) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      byAgent[e.agent] = (byAgent[e.agent] || 0) + 1;
      if (e.type === 'error' || e.type === 'check_fail') errors.push(e);
    }

    return {
      summary: {
        total_events: this.events.length,
        total_duration_ms: Date.now() - this.startTime,
        events_by_type: byType,
        events_by_agent: byAgent,
        error_count: errors.length,
        stages_entered: this.events.filter(e => e.type === 'stage_enter').map(e => e.data.stage),
      },
      events: this.events,
    };
  }

  /**
   * Write events to disk as JSONL.
   */
  flush() {
    const filePath = path.join(this.outputDir, `trace-${this.startTime}.jsonl`);
    const lastEvent = this.events[this.events.length - 1];
    if (lastEvent) {
      fs.appendFileSync(filePath, JSON.stringify(lastEvent) + '\n', 'utf-8');
    }
  }
}
