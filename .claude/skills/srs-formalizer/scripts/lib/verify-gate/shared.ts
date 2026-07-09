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

// ---------------------------------------------------------------------------
// TLA+ source placeholder-marker scanning (security gate — do not trust stale JSON)
// ---------------------------------------------------------------------------

/**
 * 保留 TLA+ 注释区域（块注释 (* ... *) + 行注释 \* ...）、丢弃代码，供匹配前净化。
 * 导出以便单测。注：嵌套块注释 (* (* *) *) 用非贪婪匹配，不追内层（TLA+ 中罕见）。
 */
export function stripTlaCode(src: string): string {
  const parts: string[] = [];
  for (const block of src.match(/\(\*[\s\S]*?\*\)/g) ?? []) parts.push(block);
  for (const line of src.split('\n')) {
    const idx = line.indexOf('\\*');
    if (idx !== -1) parts.push(line.slice(idx));
  }
  return parts.join('\n');
}

/** CJK 禁止占位标记（DESIGN behavior 门禁行 1）。ASCII 标记在下方按大写词边界匹配。 */
const TLA_CJK_MARKERS = ['待定', '未定义', '待实现'] as const;

/**
 * 扫描 specsDir 下所有 .tla，仅在注释区域匹配禁止占位标记。
 * ASCII：大写、词边界（散文小写 gap/tbd 不触发）；CJK：字面子串。
 * 目录不存在或无 .tla 时返回 []。
 */
export function scanTlaSourceForPlaceholders(
  specsDir: string,
): { file: string; marker: string }[] {
  if (!fs.existsSync(specsDir)) return [];
  const hits: { file: string; marker: string }[] = [];
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.tla')).sort();
  for (const file of files) {
    const comments = stripTlaCode(fs.readFileSync(path.join(specsDir, file), 'utf-8'));
    const asciiMatches = comments.match(/\b(TODO|FIXME|TBD|GAP)\b/g);
    if (asciiMatches) {
      for (const marker of new Set(asciiMatches)) hits.push({ file, marker });
    }
    for (const cjk of TLA_CJK_MARKERS) {
      if (comments.includes(cjk)) hits.push({ file, marker: cjk });
    }
  }
  return hits;
}
