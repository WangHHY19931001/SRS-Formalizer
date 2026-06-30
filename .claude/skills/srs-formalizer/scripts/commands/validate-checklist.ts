/**
 * validate-checklist.ts — CHECKLIST.md 校验命令
 *
 * CLI: npx tsx index.ts validate-checklist --file <path>
 *
 * 两项检查：
 *   1. 完成度：统计 - [x] vs - [ ]，全部打勾才 valid
 *   2. 结构完整性：对比阶段模板，防止 LLM 删条目/改结构来作弊
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecklistData {
  valid: boolean;
  total: number;
  checked: number;
  unchecked: number;
  unchecked_items: string[];
  checklist_name: string;
  /** 结构完整性违规 */
  integrity_errors: string[];
}

// ---------------------------------------------------------------------------
// Canonical checklist definitions (expected item count + key fingerprints)
// ---------------------------------------------------------------------------

interface CanonicalChecklist {
  /** 预期的 checkbox 条目总数 */
  expected_count: number;
  /** 必须存在的标题/节名（防止结构被删） */
  required_headers: string[];
  /** 必须存在的关键短语（每项至少匹配一个，防止条目被替换为空话） */
  required_phrases: string[];
}

const CANONICAL: Record<string, CanonicalChecklist> = {
  '1_shard': {
    expected_count: 8,
    required_headers: ['S1', '预处理', '验收清单'],
    required_phrases: ['init 成功', 'manifest 成功', 'shard_index.json', 'total_shards', '# shard_id:', 'GAPS.md', 'CONTEXT.md', 'STATE.md'],
  },
  '2_extract': {
    expected_count: 23,
    required_headers: ['S2', '需求提取', 'R1', 'Arch-1', 'R2', 'Arch-2', 'R3-1', 'Arch-3', 'R3-2'],
    required_phrases: ['validate-jsonl', 'validate-architecture', 'category ==', 'metadata', 'derived_from', 'DEPENDS_ON', 'REFINES', 'CONFLICTS_WITH'],
  },
  '3_graph': {
    expected_count: 7,
    required_headers: ['S3', '图谱构建', '验收清单'],
    required_phrases: ['build-graph', 'build-architecture', 'analyze-structure', 'export-cypher', 'validate-cypher', 'verify-gate', '边完整性'],
  },
  '4_bdd': {
    expected_count: 6,
    required_headers: ['S4', 'BDD', '验收清单'],
    required_phrases: ['generate-bdd', '# SYSTEM:', 'Given', 'When', 'Then', 'THEN_PLACEHOLDER', 'verification_method', 'validate-bdd'],
  },
  '5_formal': {
    expected_count: 8,
    required_headers: ['S5', '形式化', 'TLA+', 'Lean'],
    required_phrases: ['触发条件', '工具链', 'TLC', 'SPECS.md', 'lake build', 'sorry', 'PROOFS.md'],
  },
  '6_outputs': {
    expected_count: 6,
    required_headers: ['S6', '验收闸门', '最终清单'],
    required_phrases: ['verify-gate', 'STATE.md', 'MINDMAP.md', 'schema.cypher', 'brainstorm_context.json', '全链路'],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

function extractFirstCheckbox(line: string): { checked: boolean; text: string } | null {
  const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
  if (!match) return null;
  return { checked: match[1]!.toLowerCase() === 'x', text: match[2]!.trim() };
}

/**
 * 根据文件名推断属于哪个阶段目录。
 * 示例: "CHECKLIST" → 从路径推断; "1_shard_CHECKLIST" → "1_shard"
 */
function inferStage(filePath: string): string | null {
  const base = path.basename(filePath, path.extname(filePath)); // e.g. "CHECKLIST"
  // 也检查父目录名
  const parentDir = path.basename(path.dirname(filePath)); // e.g. "1_shard"
  if (CANONICAL[parentDir]) return parentDir;
  // 从文件名推断
  for (const stage of Object.keys(CANONICAL)) {
    if (base.includes(stage)) return stage;
  }
  return null;
}

/**
 * 检查结构完整性：条目数、标题、关键短语。
 * 返回违规列表。空列表 = 结构完整。
 */
function checkIntegrity(content: string, stage: string): string[] {
  const canonical = CANONICAL[stage];
  if (!canonical) return []; // 未知阶段，跳过结构检查

  const errors: string[] = [];
  const lines = content.split('\n');

  // 1. 条目数检查（防止删除）
  let itemCount = 0;
  for (const line of lines) {
    if (extractFirstCheckbox(line)) itemCount++;
  }
  if (itemCount < canonical.expected_count) {
    errors.push(
      `Item count mismatch: expected ${canonical.expected_count}, got ${itemCount} (${canonical.expected_count - itemCount} items deleted or missing)`
    );
  }

  // 2. 标题检查（防止结构被删）
  for (const header of canonical.required_headers) {
    if (!content.includes(header)) {
      errors.push(`Missing required header/section: "${header}"`);
    }
  }

  // 3. 关键短语检查（每项至少匹配一个，防止条目内容被替换为空话）
  const matchedPhrases = new Set<string>();
  for (const phrase of canonical.required_phrases) {
    if (content.includes(phrase)) {
      matchedPhrases.add(phrase);
    }
  }
  const missingPhrases = canonical.required_phrases.filter(p => !matchedPhrases.has(p));
  if (missingPhrases.length > 0) {
    errors.push(
      `Missing ${missingPhrases.length} required key phrases: ${missingPhrases.slice(0, 5).join(', ')}${missingPhrases.length > 5 ? '...' : ''}`
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const filePath = parseArg(args, '--file');

  if (!filePath) {
    return { status: 'error', message: 'Missing required argument: --file' };
  }

  if (!fs.existsSync(filePath)) {
    return { status: 'error', message: `File not found: ${filePath}` };
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { status: 'error', message: `Failed to read file: ${(err as Error).message}` };
  }

  const lines = content.split('\n');
  let checked = 0;
  let unchecked = 0;
  const uncheckedItems: string[] = [];

  for (const line of lines) {
    const result = extractFirstCheckbox(line);
    if (result === null) continue;
    if (result.checked) { checked++; }
    else { unchecked++; uncheckedItems.push(result.text); }
  }

  const stage = inferStage(filePath);
  const integrityErrors: string[] = stage ? checkIntegrity(content, stage) : [];

  const data: ChecklistData = {
    valid: unchecked === 0 && integrityErrors.length === 0,
    total: checked + unchecked,
    checked,
    unchecked,
    unchecked_items: uncheckedItems,
    checklist_name: path.basename(filePath, path.extname(filePath)),
    integrity_errors: integrityErrors,
  };

  return { status: 'ok', data };
}
