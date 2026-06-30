/**
 * validate-architecture.ts — 架构 JSONL 文件校验命令
 *
 * CLI: npx tsx index.ts validate-architecture --file <path> --workdir .srs_formalizer
 *
 * 校验 arch JSONL 记录（arch-1/arch-2/arch-3 通用），执行 6 项检查：
 *   1. type 必须为 module|actor|constraint（arch-1）/ action 必须为枚举值（arch-2/arch-3）
 *   2. id 格式：arch-1=ARCH-SXXX-NNNN, arch-2=ARCH2-SXXX-NNNN, arch-3=ARCH3-SXXX-NNNN
 *   3. contains 引用的 R1/R2 id 格式必须匹配 ^R[12]-[A-Za-z0-9_.]+-\d{4}$
 *   4. parent 非 null 时，必须能在同文件中找到对应的父模块名
 *   5. 检测循环：CONTAINS 关系不能形成环
 *   6. 每条必须含 reasoning 字段（长度 >=10）
 *
 * 输出：{"status":"ok","data":{"valid":true/false,"errors":[...],"warnings":[...],"record_count":N}}
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { isPathSafe, validateWorkDir } from '../lib/security.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

/** Allowed types for arch-1 records */
const ARCH1_TYPES = new Set(['module', 'actor', 'constraint']);

/** Allowed actions for arch-2 records */
const ARCH2_ACTIONS = new Set([
  'add_module',
  'add_constraint',
  'add_actor',
  'reparent',
  'merge',
]);

/** Allowed actions for arch-3 records */
const ARCH3_ACTIONS = new Set(['add_dependency_layer']);

/** Regex for arch-1 ids: ARCH-SXXX-NNNN */
const ARCH1_ID_RE = /^ARCH-[A-Za-z0-9_.]+-\d{4}$/;

/** Regex for arch-2 ids: ARCH2-SXXX-NNNN */
const ARCH2_ID_RE = /^ARCH2-[A-Za-z0-9_.]+-\d{4}$/;

/** Regex for arch-3 ids: ARCH3-SXXX-NNNN */
const ARCH3_ID_RE = /^ARCH3-[A-Za-z0-9_.]+-\d{4}$/;

/** Regex for R1/R2 requirement ids referenced in contains */
const CONTAINS_ID_RE = /^R[12]-[A-Za-z0-9_.]+-\d{4}$/;

/** Regex to check that id contains only ASCII characters */
const ASCII_ONLY_RE = /^[\x00-\x7F]*$/;

/** Minimum reasoning length */
const MIN_REASONING_LENGTH = 10;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

interface ArchRecord {
  id: unknown;
  type?: unknown;
  action?: unknown;
  name?: unknown;
  parent?: unknown;
  contains?: unknown;
  reasoning?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

/**
 * Determine the arch level from the record's id prefix or the file name hint.
 * Checks id prefix: "ARCH-" = arch-1, "ARCH2-" = arch-2, "ARCH3-" = arch-3.
 */
function detectArchLevel(record: ArchRecord): 1 | 2 | 3 | null {
  if (typeof record.id === 'string') {
    if (record.id.startsWith('ARCH2-')) return 2;
    if (record.id.startsWith('ARCH3-')) return 3;
    if (record.id.startsWith('ARCH-')) return 1;
  }
  return null;
}

/**
 * Validate a single architecture record. Returns array of error messages.
 */
function validateRecord(record: ArchRecord, index: number): string[] {
  const errors: string[] = [];
  const prefix = `record[${index}]`;

  // --- Check 1: type/action validation by arch level ---
  const archLevel = detectArchLevel(record);

  if (archLevel === 1) {
    // arch-1: type must be module|actor|constraint
    if (!isString(record.type) || !ARCH1_TYPES.has(record.type)) {
      errors.push(
        `${prefix}: type must be one of "module", "actor", or "constraint" for arch-1 record, got "${String(record.type)}"`,
      );
    }
  } else if (archLevel === 2) {
    // arch-2: action must be a valid action
    if (!isString(record.action) || !ARCH2_ACTIONS.has(record.action)) {
      errors.push(
        `${prefix}: action must be one of ${[...ARCH2_ACTIONS].join(', ')} for arch-2 record, got "${String(record.action)}"`,
      );
    }
  } else if (archLevel === 3) {
    // arch-3: action must be add_dependency_layer
    if (!isString(record.action) || !ARCH3_ACTIONS.has(record.action)) {
      errors.push(
        `${prefix}: action must be one of ${[...ARCH3_ACTIONS].join(', ')} for arch-3 record, got "${String(record.action)}"`,
      );
    }
  } else {
    errors.push(`${prefix}: unable to determine arch level from id "${String(record.id)}"`);
  }

  // --- Check 2: id format ---
  if (!isString(record.id)) {
    errors.push(`${prefix}: id must be a string`);
  } else {
    let idValid = false;
    if (record.id.startsWith('ARCH3-')) {
      idValid = ARCH3_ID_RE.test(record.id);
    } else if (record.id.startsWith('ARCH2-')) {
      idValid = ARCH2_ID_RE.test(record.id);
    } else if (record.id.startsWith('ARCH-')) {
      idValid = ARCH1_ID_RE.test(record.id);
    }

    if (!idValid) {
      errors.push(`${prefix}: invalid id format "${record.id}"`);
    }

    // ASCII-only check
    if (!ASCII_ONLY_RE.test(record.id)) {
      errors.push(`${prefix}: id "${record.id}" contains non-ASCII characters`);
    }
  }

  // --- Check 3: contains references must match R1/R2 id format ---
  if (record.contains !== undefined && record.contains !== null) {
    if (!isArray(record.contains)) {
      errors.push(`${prefix}: contains must be an array`);
    } else {
      for (let ci = 0; ci < record.contains.length; ci++) {
        const ref = record.contains[ci];
        if (!isString(ref)) {
          errors.push(`${prefix}: contains[${ci}] must be a string`);
        } else if (!CONTAINS_ID_RE.test(ref)) {
          errors.push(
            `${prefix}: contains[${ci}] "${ref}" does not match required format R[12]-XXX-NNNN`,
          );
        }
      }
    }
  }

  // --- Check 6: reasoning field (length >= 10) ---
  if (!isString(record.reasoning) || record.reasoning.trim().length < MIN_REASONING_LENGTH) {
    errors.push(`${prefix}: reasoning must be a string with at least ${MIN_REASONING_LENGTH} characters`);
  }

  return errors;
}

/**
 * Run cross-record checks (parent resolution, cycle detection).
 */
function crossRecordChecks(records: ArchRecord[]): string[] {
  const errors: string[] = [];

  // Build a set of module names from arch-1 records with type=module
  const moduleNames = new Set<string>();
  const moduleIds = new Set<string>();

  for (const rec of records) {
    if (isString(rec.name) && rec.name.length > 0) {
      moduleNames.add(rec.name);
    }
    if (isString(rec.id)) {
      moduleIds.add(rec.id);
    }
  }

  // --- Check 4: parent must resolve to an existing module name ---
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const prefix = `record[${i}]`;

    if (rec.parent !== undefined && rec.parent !== null) {
      if (!isString(rec.parent)) {
        errors.push(`${prefix}: parent must be a string or null`);
      } else if (!moduleNames.has(rec.parent)) {
        errors.push(
          `${prefix}: parent "${rec.parent}" not found in any record's name field`,
        );
      }
    }
  }

  // --- Check 5: cycle detection in CONTAINS relationships ---
  // Build adjacency list: module/constraint id -> set of contains ids
  const adjacency = new Map<string, string[]>();

  for (const rec of records) {
    if (isString(rec.id) && isArray(rec.contains)) {
      const containsRefs = rec.contains.filter(isString);
      if (containsRefs.length > 0) {
        adjacency.set(rec.id, containsRefs);
      }
    }
  }

  // Detect cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): string | null {
    if (inStack.has(nodeId)) {
      return nodeId; // cycle found
    }
    if (visited.has(nodeId)) return null;

    visited.add(nodeId);
    inStack.add(nodeId);

    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        // Only follow edges that point to other arch record ids (not R1/R2 ids)
        if (moduleIds.has(neighbor)) {
          const cycleNode = dfs(neighbor);
          if (cycleNode !== null) {
            return cycleNode;
          }
        }
      }
    }

    inStack.delete(nodeId);
    return null;
  }

  for (const nodeId of adjacency.keys()) {
    if (!visited.has(nodeId)) {
      const cyclePoint = dfs(nodeId);
      if (cyclePoint !== null) {
        errors.push(`cycle detected: module "${cyclePoint}" contains itself (directly or indirectly)`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const filePath = parseArg(args, '--file');
  const workDirArg = parseArg(args, '--workdir');

  if (!filePath) {
    return { status: 'error', message: 'Missing required argument: --file' };
  }
  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  // Check path security before reading
  if (!isPathSafe(filePath, workDir)) {
    return {
      status: 'error',
      message: `SecurityError: Path "${filePath}" is outside work directory "${workDir}". Access denied.`,
    };
  }

  // Read and parse JSONL
  if (!fs.existsSync(filePath)) {
    return { status: 'error', message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim() !== '');
  const records: ArchRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]!);
      records.push(parsed as ArchRecord);
    } catch (err) {
      return {
        status: 'ok',
        data: {
          valid: false,
          errors: [`JSON parse error at line ${i + 1}: ${(err as Error).message}`],
          warnings: [],
          record_count: 0,
        },
      };
    }
  }

  // Per-record validation
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const recordErrors = validateRecord(records[i]!, i);
    errors.push(...recordErrors);
  }

  // Cross-record checks (parent resolution, cycle detection)
  if (records.length > 0) {
    const crossErrors = crossRecordChecks(records);
    errors.push(...crossErrors);
  }

  return {
    status: 'ok',
    data: {
      valid: errors.length === 0,
      errors,
      warnings,
      record_count: records.length,
    },
  };
}
