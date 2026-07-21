/**
 * validate-dataflow.ts — 数据流抽取记录校验命令（spec 2026-07-21, ADR-0009）
 *
 * CLI: npx tsx index.ts validate-dataflow --file <path> --workdir <path>
 *
 * 校验 `2_extract/data-entities/*.jsonl`：
 *   - kind 判别（entity/flow）
 *   - entity: id 格式 DE-*、canonical 非空、source_shard SNNN、id 唯一
 *   - flow: requirement_id 格式、entity_id 指向已声明实体（无悬挂）、action 枚举
 *
 * 与 validate-jsonl 平行（数据流记录不是 R[123] JsonlRecord），故独立命令。
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';
import { isPathSafe, validateWorkDir } from '../lib/security.js';
import { validateDataFlowRecords } from '../lib/dataflow-extract.js';

export async function main(args: string[]): Promise<CliResult> {
  let filePath: string | null;
  let workDirArg: string | null;
  try {
    filePath = safeParseArg(args, '--file');
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!filePath) return { status: 'error', message: 'Missing required argument: --file' };
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!isPathSafe(filePath, workDir)) {
    return { status: 'error', message: `SecurityError: Path "${filePath}" is outside work directory "${workDir}". Access denied.` };
  }

  if (!fs.existsSync(filePath)) {
    return { status: 'error', message: `File not found: ${filePath}` };
  }

  const records: unknown[] = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    try { records.push(JSON.parse(line)); }
    catch {
      return { status: 'ok', data: { valid: false, errors: [`JSONL parse error at line ${i + 1}: invalid JSON`], warnings: [], entityCount: 0, flowCount: 0 } };
    }
  }

  const report = validateDataFlowRecords(records);
  return { status: 'ok', data: report };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
