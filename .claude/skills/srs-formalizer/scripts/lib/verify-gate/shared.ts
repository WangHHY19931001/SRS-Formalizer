/**
 * shared.ts — Shared types and helpers for verify-gate checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface VerifyCheckEntry {
  passed: boolean;
  detail: string | undefined;
}

export interface VerifyOutput {
  pass: boolean;
  checks: Record<string, VerifyCheckEntry>;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_STAGES = ['S1', 'R3', 'FINAL'] as const;

// ---------------------------------------------------------------------------
// Shared check functions
// ---------------------------------------------------------------------------

/** 读取 CHECKLIST.md 并验证所有 checkbox 已打勾 */
export function checkChecklistComplete(stageDir: string, workDir: string): CheckResult {
  try {
    const checklistPath = path.join(workDir, stageDir, 'CHECKLIST.md');
    if (!fs.existsSync(checklistPath)) {
      return {
        name: `${stageDir}/CHECKLIST.md complete`,
        passed: false,
        detail: `CHECKLIST.md not found in ${stageDir}/`,
      };
    }
    const content = fs.readFileSync(checklistPath, 'utf-8');
    const lines = content.split('\n');
    let total = 0;
    let checked = 0;
    const unchecked: string[] = [];
    for (const line of lines) {
      if (line.match(/^-\s*\[x\]/i)) { total++; checked++; }
      else if (line.match(/^-\s*\[\s*\]/)) {
        total++;
        unchecked.push(line.replace(/^-\s*\[\s*\]\s*/, '').trim().substring(0, 80));
      }
    }
    const allChecked = total > 0 && unchecked.length === 0;
    return {
      name: `${stageDir}/CHECKLIST.md complete`,
      passed: allChecked,
      detail: allChecked
        ? `All ${total}/${total} checked`
        : `${checked}/${total} checked, ${unchecked.length} unchecked: ${unchecked.slice(0, 3).join('; ')}${unchecked.length > 3 ? '...' : ''}`,
    };
  } catch {
    return { name: `${stageDir}/CHECKLIST.md complete`, passed: false, detail: 'Could not read CHECKLIST.md' };
  }
}

// ---------------------------------------------------------------------------
// Lean/TLA source placeholder scanning (security gate — do not trust stale JSON)
// ---------------------------------------------------------------------------

/** 移除 Lean 注释：块注释 /- ... -/ 与单行注释 -- ... */
export function stripLeanComments(src: string): string {
  const noBlock = src.replace(/\/-[\s\S]*?-\//g, ' ');
  return noBlock
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

/** 扫描 proofs 目录下所有 .lean，去注释后按词边界匹配 sorry / axiom */
export function scanLeanSourceForPlaceholders(
  proofsDir: string,
): { file: string; kind: 'sorry' | 'axiom' }[] {
  if (!fs.existsSync(proofsDir)) return [];
  const hits: { file: string; kind: 'sorry' | 'axiom' }[] = [];
  const files = fs.readdirSync(proofsDir).filter(f => f.endsWith('.lean')).sort();
  for (const file of files) {
    const clean = stripLeanComments(fs.readFileSync(path.join(proofsDir, file), 'utf-8'));
    if (/\bsorry\b/.test(clean)) hits.push({ file, kind: 'sorry' });
    if (/\baxiom\b/.test(clean)) hits.push({ file, kind: 'axiom' });
  }
  return hits;
}
