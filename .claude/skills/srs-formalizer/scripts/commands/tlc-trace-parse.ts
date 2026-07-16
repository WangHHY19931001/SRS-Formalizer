/**
 * tlc-trace-parse.ts — 解析 TLC 反例 trace 为结构化状态序列 JSON
 *
 * CLI: npx tsx index.ts tlc-trace-parse --trace <path>
 *
 * 职责 (DESIGN.md §8.5): 解析 TLC 输出的反例 trace，提取状态序列，
 * 供 Agent 生成反例 fixture。仅读取文件并做确定性结构化转换，
 * 不修改任何外部状态。
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraceState {
  index: number;
  action: string;
  variables: Record<string, string>;
}

export interface TraceParseData {
  states: TraceState[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** TLC 状态消息块以 STARTMSG 2110:<n> 起始，以 ENDMSG 2110 终止。 */
const START_MSG_RE = /@!@!@STARTMSG 2110:\d+ @!@!@/g;
const END_MSG = '@!@!@ENDMSG 2110';

/**
 * 将 TLC 反例 trace 文本解析为结构化状态序列。
 * 空内容或无可识别状态块时返回空数组。
 */
function parseTrace(content: string): TraceState[] {
  const states: TraceState[] = [];
  const blocks = content.split(START_MSG_RE);

  for (const block of blocks) {
    const endIdx = block.indexOf(END_MSG);
    if (endIdx === -1) continue;
    const body = block.slice(0, endIdx).trim();
    if (!body) continue;

    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const header = lines[0];
    if (!header) continue;

    // 第一行形如 "1: <Init line 5, col 3 to line 5, col 10 of module M>"
    const headerMatch = header.match(/^(\d+):\s*(.*)$/);
    if (!headerMatch) continue;
    const idxStr = headerMatch[1];
    const action = headerMatch[2];
    if (idxStr === undefined || action === undefined) continue;

    const index = parseInt(idxStr, 10);
    if (!Number.isFinite(index)) continue;

    const variables: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      // 一行可含多个 "/\\ name = value" 段
      const parts = line.split('/\\').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const eq = part.match(/^(\w+)\s*=\s*(.+)$/);
        if (!eq) continue;
        const name = eq[1];
        const value = eq[2];
        if (name === undefined || value === undefined) continue;
        variables[name] = value.trim();
      }
    }

    states.push({ index, action, variables });
  }
  return states;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let traceArg: string | null;
  try {
    traceArg = safeParseArg(args, '--trace');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!traceArg) {
    return { status: 'error', message: 'Missing required argument: --trace' };
  }

  try {
    const content = fs.readFileSync(traceArg, 'utf-8');
    const states = parseTrace(content);
    const data: TraceParseData = { states };
    return { status: 'ok', data };
  } catch (err) {
    return { status: 'error', message: `TLC trace parse failed: ${(err as Error).message}` };
  }
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
