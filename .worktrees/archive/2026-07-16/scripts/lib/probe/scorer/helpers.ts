/**
 * scorer/helpers.ts — Shared helpers for scoring capability probe answers
 */

import type { ProbeItem, ProbeResult } from '../types.js';

/** 从可能包含额外文字的字符串中提取 JSON 子串并解析 */
export function extractJson(text: string): unknown | null {
  // Try parsing whole text first
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through
  }

  // Try to find a JSON object { ... }
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // Fall through
    }
  }

  // Try to find a JSON array [ ... ]
  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      // Fall through
    }
  }

  return null;
}

/** 尝试将文本解析为 JSONL 记录数组 */
export function parseJsonlLines(text: string): Record<string, unknown>[] {
  const lines = text.split('\n');
  const records: Record<string, unknown>[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        records.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Skip invalid lines
    }
  }
  return records;
}

/**
 * 逐行评分：instruction_following 和 structured_output 共用此逻辑，
 * 但检查项不同。
 */
export function scoreJsonlRecords(
  probe: ProbeItem,
  answer: string,
  checkMap: Record<string, (records: Record<string, unknown>[], rawAnswer: string) => { score: number; detail: string }>,
): ProbeResult {
  const records = parseJsonlLines(answer);
  const details: string[] = [];
  let totalScore = 0;
  const checks = probe.expected.checks;

  for (const check of checks) {
    const handler = checkMap[check];
    if (handler) {
      const result = handler(records, answer);
      details.push(result.detail);
      totalScore += result.score;
    }
  }

  // min_records: if fewer records than expected
  if (probe.expected.min_records !== undefined && records.length < probe.expected.min_records) {
    details.push(`期望至少 ${probe.expected.min_records} 条记录，实际 ${records.length} 条`);
    totalScore *= records.length / probe.expected.min_records;
  }

  // max_records: if more records than expected (penalty for extracting too many)
  if (probe.expected.max_records !== undefined && records.length > probe.expected.max_records) {
    details.push(`期望最多 ${probe.expected.max_records} 条记录，实际 ${records.length} 条`);
    totalScore *= probe.expected.max_records / records.length;
  }

  const finalScore = Math.round(totalScore / checks.length);

  return {
    probe_id: probe.probe_id,
    dimension: probe.dimension,
    score: Math.max(0, Math.min(100, finalScore)),
    details,
    passed: finalScore >= 70,
  };
}
