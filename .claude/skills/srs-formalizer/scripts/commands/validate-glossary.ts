/**
 * validate-glossary.ts — 术语表 JSON 校验命令
 *
 * CLI: npx tsx index.ts validate-glossary --file <path> [--min-high N]
 *
 * 校验来自并行子代理的术语表批次 JSON 文件的格式和内容质量。
 * 检查项：
 *   1. 合法 JSON 结构（batch_id、shards_covered、terms 数组）
 *   2. 每 term 必填字段完整（term、definition、source_shard、confidence、category）
 *   3. confidence 枚举合法（high/medium/low）
 *   4. category 枚举合法（domain_concept/acronym/technical_entity/business_entity/defined_term）
 *   5. definition 长度合理（≥10 字符，≤500 字符）
 *   6. term 名称合理（≥2 字符，≤100 字符）
 *   7. 无重复 term（case-insensitive）
 *   8. 高置信度条数 ≥ --min-high（默认 5）
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg, isPathSafe, validateWorkDir } from '../lib/cli.js';

// ===================== Types =====================

interface GlossaryCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: 'error' | 'warning';
}

// ===================== Validation Helpers =====================

const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const VALID_CATEGORIES = new Set(['domain_concept', 'acronym', 'technical_entity', 'business_entity', 'defined_term']);

function validateBatch(batch: unknown, minHigh: number): GlossaryCheck[] {
  const checks: GlossaryCheck[] = [];

  // 1. Top-level structure
  if (typeof batch !== 'object' || batch === null || Array.isArray(batch)) {
    checks.push({ name: 'valid_json_structure', passed: false, detail: '根节点必须是 JSON 对象（非数组）', severity: 'error' });
    return checks; // Can't continue
  }
  checks.push({ name: 'valid_json_structure', passed: true, detail: '✓ JSON 对象结构正确', severity: 'error' });

  const b = batch as Record<string, unknown>;

  // 2. batch_id
  if (typeof b.batch_id !== 'string' || b.batch_id.trim() === '') {
    checks.push({ name: 'batch_id_present', passed: false, detail: '缺少 batch_id 或为空', severity: 'error' });
  } else {
    checks.push({ name: 'batch_id_present', passed: true, detail: `batch_id: ${b.batch_id}`, severity: 'error' });
  }

  // 3. shards_covered
  if (!Array.isArray(b.shards_covered) || b.shards_covered.length === 0) {
    checks.push({ name: 'shards_covered', passed: false, detail: 'shards_covered 必须是长度 ≥1 的数组', severity: 'error' });
  } else {
    const allValid = b.shards_covered.every((s: unknown) => typeof s === 'string' && /^S\d{3}$/.test(s as string));
    if (!allValid) {
      checks.push({ name: 'shards_covered', passed: false, detail: 'shards_covered 包含无效 ID（须为 S001-S999 格式）', severity: 'error' });
    } else {
      checks.push({ name: 'shards_covered', passed: true, detail: `覆盖 ${b.shards_covered.length} 个分片`, severity: 'error' });
    }
  }

  // 4. terms array
  const terms = b.terms as unknown[];
  if (!Array.isArray(terms)) {
    checks.push({ name: 'terms_array', passed: false, detail: 'terms 必须是数组', severity: 'error' });
    return checks; // Can't check per-term
  }
  if (terms.length === 0) {
    checks.push({ name: 'terms_array', passed: false, detail: 'terms 数组为空 —— 至少应提取 1 个术语', severity: 'error' });
    return checks;
  }
  checks.push({ name: 'terms_array', passed: true, detail: `共 ${terms.length} 个术语`, severity: 'error' });

  // 5. Per-term checks
  const seenTerms = new Map<string, number>();
  let highCount = 0;
  let malformedCount = 0;
  let shortDefCount = 0;
  let longDefCount = 0;

  for (let i = 0; i < terms.length; i++) {
    const t = terms[i] as Record<string, unknown> | undefined;
    if (!t || typeof t !== 'object') {
      malformedCount++;
      continue;
    }

    // Required fields
    const missingFields: string[] = [];
    if (typeof t.term !== 'string' || t.term.trim() === '') missingFields.push('term');
    if (typeof t.definition !== 'string' || t.definition.trim() === '') missingFields.push('definition');
    if (typeof t.source_shard !== 'string') missingFields.push('source_shard');
    if (!VALID_CONFIDENCE.has(t.confidence as string)) missingFields.push('confidence');
    if (!VALID_CATEGORIES.has(t.category as string)) missingFields.push('category');

    if (missingFields.length > 0) {
      malformedCount++;
      continue;
    }

    const term = (t.term as string).trim();
    const def = (t.definition as string).trim();

    // Term name length
    if (term.length < 2) malformedCount++;
    if (term.length > 100) malformedCount++;

    // Definition length
    if (def.length < 10) shortDefCount++;
    if (def.length > 500) longDefCount++;

    // Confidence
    if (t.confidence === 'high') highCount++;

    // Duplicate check
    const key = term.toLowerCase();
    if (seenTerms.has(key)) {
      seenTerms.set(key, seenTerms.get(key)! + 1);
    } else {
      seenTerms.set(key, 1);
    }
  }

  const dupes = Array.from(seenTerms.entries()).filter(([, c]) => c > 1);

  checks.push({
    name: 'term_required_fields',
    passed: malformedCount === 0,
    detail: malformedCount > 0
      ? `${malformedCount}/${terms.length} 个术语缺少必填字段或格式错误`
      : `✓ 全部 ${terms.length} 个术语字段完整`,
    severity: 'error',
  });

  checks.push({
    name: 'definition_length',
    passed: shortDefCount === 0 && longDefCount === 0,
    detail: [
      shortDefCount > 0 ? `${shortDefCount} 个定义过短（<10 字符）` : '',
      longDefCount > 0 ? `${longDefCount} 个定义过长（>500 字符）` : '',
    ].filter(Boolean).join('; ') || '✓ 全部定义长度合理',
    severity: 'warning',
  });

  checks.push({
    name: 'no_duplicate_terms',
    passed: dupes.length === 0,
    detail: dupes.length > 0
      ? `${dupes.length} 个重复术语: ${dupes.map(([t]) => t).join(', ')}`
      : '✓ 无重复术语',
    severity: 'error',
  });

  // 6. High-confidence gate
  checks.push({
    name: `min_high_confidence_≥${minHigh}`,
    passed: highCount >= minHigh,
    detail: highCount >= minHigh
      ? `✓ ${highCount} 个高置信度术语（需要 ≥${minHigh}）`
      : `仅 ${highCount}/${minHigh} 个高置信度术语，缺口 ${minHigh - highCount}`,
    severity: 'error',
  });

  return checks;
}

// ===================== Main =====================

export async function main(args: string[]): Promise<CliResult> {
  let filePath: string | null;
  let minHighStr: string | null;
  let workDirArg: string | null;
  try {
    filePath = safeParseArg(args, '--file');
    minHighStr = safeParseArg(args, '--min-high');
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!filePath) {
    return { status: 'error', message: 'Missing required argument: --file' };
  }

  const minHigh = minHighStr ? parseInt(minHighStr, 10) : 5;
  if (isNaN(minHigh) || minHigh < 0) {
    return { status: 'error', message: '--min-high must be a non-negative integer' };
  }

  // Path security
  if (workDirArg) {
    let workDir: string;
    try {
      workDir = validateWorkDir(workDirArg);
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
    if (!isPathSafe(filePath, workDir)) {
      return { status: 'error', message: `SecurityError: file outside workdir` };
    }
  }

  // Check file exists
  if (!fs.existsSync(filePath)) {
    return { status: 'error', message: `File not found: ${filePath}` };
  }

  // Read and parse
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { status: 'error', message: `Failed to read file: ${(err as Error).message}` };
  }

  let batch: unknown;
  try {
    batch = JSON.parse(raw);
  } catch {
    return { status: 'error', message: '文件不是合法 JSON' };
  }

  const checks = validateBatch(batch, minHigh);
  const errorCount = checks.filter(c => c.severity === 'error' && !c.passed).length;
  const warningCount = checks.filter(c => c.severity === 'warning' && !c.passed).length;
  const allPassed = checks.filter(c => c.severity === 'error').every(c => c.passed);

  return {
    status: allPassed ? 'ok' : 'error',
    data: {
      passed: allPassed,
      errors: errorCount,
      warnings: warningCount,
      checks: checks.map(c => ({ name: c.name, passed: c.passed, detail: c.detail, severity: c.severity })),
    },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
