/**
 * validate-architecture.ts — 架构 JSONL 文件校验命令
 *
 * CLI: npx tsx index.ts validate-architecture --file <path> --workdir .srs_formalizer
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';
import { isPathSafe, validateWorkDir } from '../lib/security.js';
import { validateRecord, crossRecordChecks, type ArchRecord } from '../lib/architecture/validator.js';

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

  if (!fs.existsSync(filePath)) return { status: 'error', message: `File not found: ${filePath}` };

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim() !== '');
  const records: ArchRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    try { records.push(JSON.parse(lines[i]!) as ArchRecord); }
    catch (err) {
      return { status: 'ok', data: { valid: false, errors: [`JSON parse error at line ${i + 1}: ${(err as Error).message}`], warnings: [], record_count: 0 } };
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < records.length; i++) {
    errors.push(...validateRecord(records[i]!, i));
  }

  if (records.length > 0) errors.push(...crossRecordChecks(records));

  return { status: 'ok', data: { valid: errors.length === 0, errors, warnings, record_count: records.length } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
