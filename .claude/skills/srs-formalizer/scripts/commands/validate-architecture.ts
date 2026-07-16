/**
 * validate-architecture.ts — 架构 JSONL 文件校验命令
 *
 * CLI: npx tsx index.ts validate-architecture --file <path> --workdir .srs_formalizer
 *
 * 保留门禁校验器：仅做确定性格式/结构校验。逻辑内联自原 lib/architecture/validator.ts
 * （该模块在重构中归档）。包含逐记录格式校验（id 格式、type/action 枚举、contains
 * 引用格式、reasoning 长度）与确定性的跨记录结构校验（parent 名解析、CONTAINS 环检测）。
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg, refuseDirectInvocation } from '../lib/cli.js';
import { isPathSafe, validateWorkDir } from '../lib/security.js';

const ARCH1_TYPES = new Set(['module', 'actor', 'constraint']);
const ARCH2_ACTIONS = new Set(['add_module', 'add_constraint', 'add_actor', 'reparent', 'merge']);
const ARCH3_ACTIONS = new Set(['add_dependency_layer']);
const ARCH1_ID_RE = /^ARCH-[A-Za-z0-9_.]+-\d{4}$/;
const ARCH2_ID_RE = /^ARCH2-[A-Za-z0-9_.]+-\d{4}$/;
const ARCH3_ID_RE = /^ARCH3-[A-Za-z0-9_.]+-\d{4}$/;
const CONTAINS_ID_RE = /^R[12]-[A-Za-z0-9_.]+-\d{4}$/;
const ASCII_ONLY_RE = /^[\x00-\x7F]*$/;
const MIN_REASONING_LENGTH = 10;

interface ArchRecord {
  id: unknown;
  type?: unknown;
  action?: unknown;
  name?: unknown;
  parent?: unknown;
  contains?: unknown;
  reasoning?: unknown;
}

function isString(v: unknown): v is string { return typeof v === 'string'; }
function isArray(v: unknown): v is unknown[] { return Array.isArray(v); }

function detectArchLevel(record: ArchRecord): 1 | 2 | 3 | null {
  if (isString(record.id)) {
    if (record.id.startsWith('ARCH2-')) return 2;
    if (record.id.startsWith('ARCH3-')) return 3;
    if (record.id.startsWith('ARCH-')) return 1;
  }
  return null;
}

function validateRecord(record: ArchRecord, index: number): string[] {
  const errors: string[] = [];
  const prefix = `record[${index}]`;
  const archLevel = detectArchLevel(record);

  if (archLevel === 1) {
    if (!isString(record.type) || !ARCH1_TYPES.has(record.type)) {
      errors.push(`${prefix}: type must be one of "module", "actor", or "constraint" for arch-1 record, got "${String(record.type)}"`);
    }
  } else if (archLevel === 2) {
    if (!isString(record.action) || !ARCH2_ACTIONS.has(record.action)) {
      errors.push(`${prefix}: action must be one of ${[...ARCH2_ACTIONS].join(', ')} for arch-2 record, got "${String(record.action)}"`);
    }
  } else if (archLevel === 3) {
    if (!isString(record.action) || !ARCH3_ACTIONS.has(record.action)) {
      errors.push(`${prefix}: action must be one of ${[...ARCH3_ACTIONS].join(', ')} for arch-3 record, got "${String(record.action)}"`);
    }
  } else {
    errors.push(`${prefix}: unable to determine arch level from id "${String(record.id)}"`);
  }

  if (!isString(record.id)) {
    errors.push(`${prefix}: id must be a string`);
  } else {
    let idValid = false;
    if (record.id.startsWith('ARCH3-')) idValid = ARCH3_ID_RE.test(record.id);
    else if (record.id.startsWith('ARCH2-')) idValid = ARCH2_ID_RE.test(record.id);
    else if (record.id.startsWith('ARCH-')) idValid = ARCH1_ID_RE.test(record.id);

    if (!idValid) errors.push(`${prefix}: invalid id format "${record.id}"`);
    if (!ASCII_ONLY_RE.test(record.id)) errors.push(`${prefix}: id "${record.id}" contains non-ASCII characters`);
  }

  if (record.contains !== undefined && record.contains !== null) {
    if (!isArray(record.contains)) {
      errors.push(`${prefix}: contains must be an array`);
    } else {
      for (let ci = 0; ci < record.contains.length; ci++) {
        const ref = record.contains[ci];
        if (!isString(ref)) errors.push(`${prefix}: contains[${ci}] must be a string`);
        else if (!CONTAINS_ID_RE.test(ref)) errors.push(`${prefix}: contains[${ci}] "${ref}" does not match required format R[12]-XXX-NNNN`);
      }
    }
  }

  if (!isString(record.reasoning) || record.reasoning.trim().length < MIN_REASONING_LENGTH) {
    errors.push(`${prefix}: reasoning must be a string with at least ${MIN_REASONING_LENGTH} characters`);
  }

  return errors;
}

function crossRecordChecks(records: ArchRecord[]): string[] {
  const errors: string[] = [];
  const moduleNames = new Set<string>();
  const moduleIds = new Set<string>();

  for (const rec of records) {
    if (isString(rec.name) && rec.name.length > 0) moduleNames.add(rec.name);
    if (isString(rec.id)) moduleIds.add(rec.id);
  }

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const prefix = `record[${i}]`;
    if (rec.parent !== undefined && rec.parent !== null) {
      if (!isString(rec.parent)) errors.push(`${prefix}: parent must be a string or null`);
      else if (!moduleNames.has(rec.parent)) errors.push(`${prefix}: parent "${rec.parent}" not found in any record's name field`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const rec of records) {
    if (isString(rec.id) && isArray(rec.contains)) {
      const containsRefs = rec.contains.filter(isString);
      if (containsRefs.length > 0) adjacency.set(rec.id, containsRefs);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): string | null {
    if (inStack.has(nodeId)) return nodeId;
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    inStack.add(nodeId);
    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (moduleIds.has(neighbor)) {
          const cycleNode = dfs(neighbor);
          if (cycleNode !== null) return cycleNode;
        }
      }
    }
    inStack.delete(nodeId);
    return null;
  }

  for (const nodeId of adjacency.keys()) {
    if (!visited.has(nodeId)) {
      const cyclePoint = dfs(nodeId);
      if (cyclePoint !== null) errors.push(`cycle detected: module "${cyclePoint}" contains itself (directly or indirectly)`);
    }
  }

  return errors;
}

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

refuseDirectInvocation(import.meta.url);
