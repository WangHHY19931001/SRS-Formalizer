/**
 * shared.ts — Shared types and helpers for verify-gate checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { SRSIR } from '../../types/srs-ir.js';

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

export const VALID_STAGES = ['S1', 'R3', 'B2', 'B3', 'B4', 'FINAL'] as const;

// ---------------------------------------------------------------------------
// Shared check functions
// ---------------------------------------------------------------------------

/** 读取 srs-ir.json，失败返回 null */
export function loadIR(workDir: string): SRSIR | null {
  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR;
  } catch {
    return null;
  }
}

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
// STATE.md cross-validation (P1-11)
// ---------------------------------------------------------------------------

/**
 * P1-11: 交叉校验 STATE.md 与 CHECKLIST.md 的一致性。
 * 检查 STATE.md 中标记为 ✅ 的阶段，其对应 CHECKLIST.md 是否也已完成。
 * 同时检查 STATE.md 是否包含运维必需字段（last_verify_gate / skipped_modules / tool_failures）。
 */
export function checkStateMdCrossCheck(workDir: string): CheckResult {
  const name = 'STATE.md cross-validation';
  const statePath = path.join(workDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    return { name, passed: false, detail: 'STATE.md not found' };
  }
  const content = fs.readFileSync(statePath, 'utf-8');
  const issues: string[] = [];

  // Check required fields
  const requiredFields = ['last_verify_gate', 'skipped_modules', 'tool_failures'];
  for (const field of requiredFields) {
    if (!content.includes(field)) {
      issues.push(`missing field: ${field}`);
    }
  }

  // Cross-check: if STATE.md marks a stage as ✅, its CHECKLIST should be complete
  const stageMap: Record<string, string> = {
    'S1 预处理': 'S0',
    'S2 需求提取': '2_extract',
    'S3 图谱构建': '3_graph',
    'S4 BDD 生成': '4_bdd',
    'S5 形式化': '5_formal',
    'S6 验收闸门': '6_outputs',
  };
  for (const [stageLabel, checklistDir] of Object.entries(stageMap)) {
    const stageDoneRegex = new RegExp(`\\|\\s*${stageLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*✅`);
    if (stageDoneRegex.test(content)) {
      const checklistPath = path.join(workDir, checklistDir, 'CHECKLIST.md');
      if (fs.existsSync(checklistPath)) {
        const checklistContent = fs.readFileSync(checklistPath, 'utf-8');
        const hasUnchecked = /^-\s*\[\s*\]/m.test(checklistContent);
        if (hasUnchecked) {
          issues.push(`STATE.md marks ${stageLabel} as ✅ but ${checklistDir}/CHECKLIST.md has unchecked items`);
        }
      }
    }
  }

  return {
    name,
    passed: issues.length === 0,
    detail: issues.length === 0
      ? 'STATE.md fields present and consistent with CHECKLISTs'
      : issues.join('; '),
  };
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

// ---------------------------------------------------------------------------
// P0-1: Persistent gate receipts — prevent orchestrators from lying about gate passage
// ---------------------------------------------------------------------------

/**
 * P0-1: 把门禁结论持久化为 `_ctx/gate-{stage}.json`，含 workdir hash + timestamp + verdict。
 * STATE.md 的阶段✅标记必须引用此文件的 receiptHash，避免编排者谎报通过。
 */
export function writeGateReceipt(
  workDir: string,
  stage: string,
  output: VerifyOutput,
): string {
  const ctxDir = path.join(workDir, '_ctx');
  fs.mkdirSync(ctxDir, { recursive: true });
  const receipt = {
    stage,
    timestamp: new Date().toISOString(),
    verdict: output.pass ? 'pass' : 'fail',
    errors: output.errors,
    // workdir hash 防止 receipt 跨工作目录复用
    workdirHash: crypto
      .createHash('sha256')
      .update(fs.realpathSync(workDir))
      .digest('hex')
      .slice(0, 16),
  };
  const json = JSON.stringify(receipt, null, 2);
  const receiptHash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  const receiptWithHash = { ...receipt, receiptHash };
  const receiptPath = path.join(ctxDir, `gate-${stage}.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receiptWithHash, null, 2), 'utf-8');
  return receiptPath;
}

/**
 * P0-1: 校验指定 stage 的 gate 凭证存在且 verdict=pass。
 * assemble-ir / orchestrator 在阶段转换时调用此函数。
 */
export function verifyGateReceipt(workDir: string, stage: string): {
  valid: boolean;
  reason?: string;
} {
  const receiptPath = path.join(workDir, '_ctx', `gate-${stage}.json`);
  if (!fs.existsSync(receiptPath)) {
    return { valid: false, reason: `Missing gate receipt: _ctx/gate-${stage}.json` };
  }
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8')) as {
      stage: string;
      verdict: string;
      workdirHash: string;
      receiptHash: string;
    };
    if (receipt.stage !== stage) {
      return { valid: false, reason: `Stage mismatch: expected ${stage}, got ${receipt.stage}` };
    }
    if (receipt.verdict !== 'pass') {
      return { valid: false, reason: `Gate ${stage} verdict=${receipt.verdict}` };
    }
    const currentWorkdirHash = crypto
      .createHash('sha256')
      .update(fs.realpathSync(workDir))
      .digest('hex')
      .slice(0, 16);
    if (receipt.workdirHash !== currentWorkdirHash) {
      return { valid: false, reason: 'workdirHash mismatch — receipt from different workdir' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Corrupt receipt: ${(err as Error).message}` };
  }
}
