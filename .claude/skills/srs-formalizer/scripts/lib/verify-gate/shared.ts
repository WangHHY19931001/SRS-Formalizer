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
