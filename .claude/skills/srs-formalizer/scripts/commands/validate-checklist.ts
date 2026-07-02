/**
 * validate-checklist.ts — CHECKLIST.md 校验 + 修复
 *
 * CLI: npx tsx index.ts validate-checklist --file <path> [--repair]
 *
 * --repair: 结构完整性违规时，删除旧文件并从模板重建
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { CANONICAL, repairChecklist, inferStage } from '../lib/checklists.js';
import { safeParseArg } from '../lib/cli.js';

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
  integrity_errors: string[];
  repaired?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function extractFirstCheckbox(line: string): { checked: boolean; text: string } | null {
  const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
  if (!match) return null;
  return { checked: match[1]!.toLowerCase() === 'x', text: match[2]!.trim() };
}

function checkIntegrity(content: string, stage: string): string[] {
  const canonical = CANONICAL[stage];
  if (!canonical) return [];
  const errors: string[] = [];
  const lines = content.split('\n');

  let itemCount = 0;
  for (const line of lines) {
    if (extractFirstCheckbox(line)) itemCount++;
  }
  if (itemCount < canonical.expected_count) {
    errors.push(`Item count mismatch: expected ${canonical.expected_count}, got ${itemCount} (${canonical.expected_count - itemCount} items deleted)`);
  }
  for (const header of canonical.required_headers) {
    if (!content.includes(header)) errors.push(`Missing required header: "${header}"`);
  }
  const missing = canonical.required_phrases.filter(p => !content.includes(p));
  if (missing.length > 0) {
    errors.push(`Missing ${missing.length} key phrases: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
  }
  return errors;
}

function getWorkDir(filePath: string): string | null {
  // filePath is like <workdir>/1_shard/CHECKLIST.md → workdir is the parent of 1_shard
  const stage = inferStage(filePath);
  if (!stage) return null;
  const stageDir = path.dirname(filePath); // .../1_shard
  return path.dirname(stageDir);            // <workdir>
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let filePath: string | null;
  try {
    filePath = safeParseArg(args, '--file');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
  const doRepair = hasFlag(args, '--repair');

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
  let checked = 0, unchecked = 0;
  const uncheckedItems: string[] = [];

  for (const line of lines) {
    const r = extractFirstCheckbox(line);
    if (!r) continue;
    if (r.checked) { checked++; }
    else { unchecked++; uncheckedItems.push(r.text); }
  }

  const stage = inferStage(filePath);
  const integrityErrors = stage ? checkIntegrity(content, stage) : [];
  let repaired = false;

  // --repair: if integrity violated, rebuild from template
  if (doRepair && integrityErrors.length > 0 && stage) {
    const workDir = getWorkDir(filePath);
    if (workDir) {
      const result = repairChecklist(workDir, stage);
      repaired = result.repaired;
      if (repaired) {
        // Re-read the repaired file for the response
        content = fs.readFileSync(filePath, 'utf-8');
        const newLines = content.split('\n');
        checked = 0; unchecked = 0; uncheckedItems.length = 0;
        for (const line of newLines) {
          const r = extractFirstCheckbox(line);
          if (!r) continue;
          if (r.checked) { checked++; }
          else { unchecked++; uncheckedItems.push(r.text); }
        }
        integrityErrors.length = 0;
        integrityErrors.push(`Repaired: ${result.message}`);
      }
    }
  }

  const data: ChecklistData = {
    valid: unchecked === 0 && integrityErrors.filter(e => !e.startsWith('Repaired:')).length === 0,
    total: checked + unchecked,
    checked,
    unchecked,
    unchecked_items: uncheckedItems,
    checklist_name: path.basename(filePath, path.extname(filePath)),
    integrity_errors: integrityErrors,
    ...(repaired ? { repaired: true } : {}),
  };

  return { status: 'ok', data };
}
