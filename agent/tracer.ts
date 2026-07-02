/**
 * tracer.ts — Agent observation & tracing system
 *
 * Each agent gets a unique agentId. All trace events are written to:
 *   <logDir>/<agentId>.jsonl
 *
 * Sub-agents share the same logDir but get their own agentId and file.
 * LLM interactions are logged internally — not exposed to the user.
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
  agentId: string;
  agentRole: 'orchestrator' | 'worker';
  data: Record<string, unknown>;
}

let idCounter = 0;

export class Tracer {
  private events: TraceEvent[] = [];
  private startTime: number;
  logDir: string;
  agentId: string;
  private filePath: string;

  constructor(agentRole: 'orchestrator' | 'worker', logDir?: string) {
    this.startTime = Date.now();
    this.logDir = logDir || '/tmp/srs-agent-traces';
    this.agentId = `${agentRole}-${Date.now()}-${++idCounter}`;
    fs.mkdirSync(this.logDir, { recursive: true });
    this.filePath = path.join(this.logDir, `${this.agentId}.jsonl`);
  }

  log(type: TraceEventType, agentRole: 'orchestrator' | 'worker', data: Record<string, unknown>) {
    const event: TraceEvent = {
      timestamp: new Date().toISOString(),
      type,
      agentId: this.agentId,
      agentRole,
      data,
    };
    this.events.push(event);
    this.flush();
  }

  llmRequest(agentRole: 'orchestrator' | 'worker', messages: unknown[], tools?: unknown[]) {
    this.log('llm_request', agentRole, { message_count: (messages as Array<unknown>).length, tool_count: tools ? (tools as Array<unknown>).length : 0 });
  }

  llmResponse(agentRole: 'orchestrator' | 'worker', response: string, toolCalls?: unknown[], durationMs?: number) {
    this.log('llm_response', agentRole, { response_preview: response.slice(0, 200), tool_calls: toolCalls ? (toolCalls as Array<unknown>).length : 0, duration_ms: durationMs });
  }

  toolCall(agentRole: 'orchestrator' | 'worker', toolName: string, args: Record<string, unknown>) {
    this.log('tool_call', agentRole, { tool: toolName, args: JSON.stringify(args).slice(0, 200) });
  }

  toolResult(agentRole: 'orchestrator' | 'worker', toolName: string, result: string, durationMs: number) {
    this.log('tool_result', agentRole, { tool: toolName, result_preview: result.slice(0, 200), duration_ms: durationMs });
  }

  stageEnter(agentRole: 'orchestrator' | 'worker', stage: string) {
    this.log('stage_enter', agentRole, { stage });
  }

  error(agentRole: 'orchestrator' | 'worker', context: string, error: string) {
    this.log('error', agentRole, { context, error });
  }

  report(): { summary: Record<string, unknown>; agentId: string; logFile: string } {
    const byType: Record<string, number> = {};
    for (const e of this.events) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    return {
      summary: {
        agentId: this.agentId,
        total_events: this.events.length,
        total_duration_ms: Date.now() - this.startTime,
        events_by_type: byType,
      },
      agentId: this.agentId,
      logFile: this.filePath,
    };
  }

  private flush() {
    const lastEvent = this.events[this.events.length - 1];
    if (lastEvent) {
      fs.appendFileSync(this.filePath, JSON.stringify(lastEvent) + '\n', 'utf-8');
    }
  }
}
