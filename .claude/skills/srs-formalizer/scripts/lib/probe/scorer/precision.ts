/**
 * scorer/precision.ts — Scoring for precision dimension
 */

import type { ProbeItem, ProbeResult } from '../types.js';
import { extractJson } from './helpers.js';

export function scorePrecision(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let extracted: string[] = [];
  let score = 0;
  const checks = probe.expected.checks;

  // Use probe-specific expected data
  const realKeywords = probe.expected.expected_real_reqs ?? [];
  const fakeKeywords = probe.expected.fake_keywords ?? [];

  if (Array.isArray(parsed)) {
    extracted = parsed.map(String);
  }

  if (extracted.length === 0) {
    for (const check of checks) {
      if (check === 'no_fabricated') details.push('no_fabricated: 无提取结果');
      if (check === 'no_missing') details.push('no_missing: 无提取结果');
    }
    return { probe_id: probe.probe_id, dimension: 'precision', score: 0, details, passed: false };
  }

  const containsFabricated = extracted.some((item) =>
    fakeKeywords.some((kw) => item.includes(kw)),
  );

  const fabricatedInAnswer = extracted.filter((item) =>
    fakeKeywords.some((kw) => item.includes(kw)),
  );

  if (checks.includes('no_fabricated')) {
    if (containsFabricated) {
      details.push(`no_fabricated: 包含编造需求 (${fabricatedInAnswer.length} 条)`);
    } else {
      details.push('no_fabricated: ✓ 未包含编造需求');
    }
  }

  // Check no_missing: all real requirements should be extracted
  const matchedReals = realKeywords.filter((kw) =>
    extracted.some((item) => item.includes(kw)),
  );

  if (checks.includes('no_missing')) {
    if (matchedReals.length >= realKeywords.length) {
      details.push(`no_missing: ✓ 提取了全部 ${realKeywords.length} 条真实需求`);
    } else {
      details.push(`no_missing: 只提取了 ${matchedReals.length}/${realKeywords.length} 条真实需求`);
    }
  }

  // Check dedup_correct: each unique real requirement topic maps to at most one extracted item
  let dedupScore = 0;
  if (checks.includes('dedup_correct')) {
    const dedupViolations = realKeywords.filter((kw) =>
      extracted.filter((item) => item.includes(kw)).length > 1
    );
    if (dedupViolations.length === 0) {
      dedupScore = 100;
      details.push(`dedup_correct: ✓ 无重复主题 (覆盖 ${realKeywords.length} 个主题)`);
    } else if (dedupViolations.length < realKeywords.length) {
      dedupScore = 50;
      details.push(`dedup_correct: 部分主题重复提取 (${dedupViolations.length}/${realKeywords.length} 个)`);
    } else {
      dedupScore = 0;
      details.push(`dedup_correct: 全部主题重复提取 (${dedupViolations.length}/${realKeywords.length} 个)`);
    }
  }

  // Check cross_line_resolved: "同上" references expanded correctly
  let crossLineScore = 0;
  if (checks.includes('cross_line_resolved')) {
    const allItems = extracted.join(' ');
    const expectedKeywords = ['工号', '成绩', '退选'];
    const matchedCount = expectedKeywords.filter((kw) => allItems.includes(kw)).length;
    const countReasonable = extracted.length >= 7 && extracted.length <= 8;
    if (matchedCount === expectedKeywords.length && countReasonable) {
      crossLineScore = 100;
      details.push(`cross_line_resolved: ✓ 正确展开 "同上" 引用 (${matchedCount}/${expectedKeywords.length} 关键词, ${extracted.length} 条)`);
    } else if (matchedCount > 0) {
      crossLineScore = 50;
      details.push(`cross_line_resolved: 部分展开 "同上" 引用 (${matchedCount}/${expectedKeywords.length} 关键词, ${extracted.length} 条)`);
    } else {
      crossLineScore = 0;
      details.push(`cross_line_resolved: 未展开 "同上" 引用`);
    }
  }

  // Calculate F-score / average
  const precision = extracted.length > 0 ? (extracted.length - fabricatedInAnswer.length) / extracted.length : 0;
  const recall = realKeywords.length > 0 ? matchedReals.length / realKeywords.length : 1;

  // Convert to score 0-100: average of precision and recall
  score = Math.round(((containsFabricated ? 0 : precision) + recall) / 2 * 100);

  // Blend in new check scores
  const newCheckScores: number[] = [];
  if (checks.includes('dedup_correct')) newCheckScores.push(dedupScore);
  if (checks.includes('cross_line_resolved')) newCheckScores.push(crossLineScore);
  if (newCheckScores.length > 0) {
    const avgNew = newCheckScores.reduce((a, b) => a + b, 0) / newCheckScores.length;
    score = Math.round((score + avgNew) / 2);
  }

  // cap
  score = Math.max(0, Math.min(100, score));

  return {
    probe_id: probe.probe_id,
    dimension: 'precision',
    score,
    details,
    passed: score >= 70,
  };
}
