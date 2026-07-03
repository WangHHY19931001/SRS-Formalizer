/**
 * scorer/instruction-following.ts — Scoring for instruction_following dimension
 */

import type { ProbeItem, ProbeResult } from '../types.js';
import { scoreJsonlRecords } from './helpers.js';

const VALID_CATEGORIES = ['explicit', 'implicit', 'relational'];

export function scoreInstructionFollowing(probe: ProbeItem, answer: string): ProbeResult {
  const expectedPrefix = probe.expected.id_prefix ?? 'R1';
  const dynamicIdRe = new RegExp(`^${expectedPrefix}-[A-Z]+-\\d{4}$`);

  const checkMap: Record<string, (records: Record<string, unknown>[], rawAnswer: string) => { score: number; detail: string }> = {
    id_format: (records) => {
      if (records.length === 0) return { score: 0, detail: 'id_format: 无记录可检查' };
      const passed = records.filter((r) => dynamicIdRe.test(String(r.id ?? '')));
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `id_format (${expectedPrefix}): ${passed.length}/${records.length} 条记录 ID 格式正确 (${pct}%)` };
    },
    category_enum: (records) => {
      if (records.length === 0) return { score: 0, detail: 'category_enum: 无记录可检查' };
      const passed = records.filter((r) => VALID_CATEGORIES.includes(String(r.category ?? '')));
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `category_enum: ${passed.length}/${records.length} 条记录 category 合法 (${pct}%)` };
    },
    metadata_present: (records) => {
      if (records.length === 0) return { score: 0, detail: 'metadata_present: 无记录可检查' };
      const passed = records.filter((r) => r.metadata !== undefined && r.metadata !== null);
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `metadata_present: ${passed.length}/${records.length} 条记录包含 metadata (${pct}%)` };
    },
    no_missing_field_warning: (_, rawAnswer) => {
      // LLM should refuse or warn about missing source_file and metadata fields
      const mentionsMissing = rawAnswer.includes('source_file') || rawAnswer.includes('metadata') ||
        rawAnswer.includes('缺少') || rawAnswer.includes('缺失') || rawAnswer.includes('不完整') ||
        rawAnswer.includes('incomplete') || rawAnswer.includes('missing');
      if (mentionsMissing) {
        return { score: 100, detail: 'no_missing_field_warning: ✓ 检测到模板字段缺失并提醒' };
      }
      return { score: 0, detail: 'no_missing_field_warning: 未检测到模板字段缺失警告，LLM 盲从了不完整模板' };
    },
    no_interference_extraction: (records, _rawAnswer) => {
      if (records.length === 0) return { score: 0, detail: 'no_interference_extraction: 无记录可检查' };
      // LLM should NOT extract implementation details or non-requirements
      const interferenceKeywords = ['PostgreSQL', 'React', '美化', '验证码', '推荐算法'];
      const extractedText = records.map(r => JSON.stringify(r)).join(' ');
      const hasInterference = interferenceKeywords.some(kw => extractedText.includes(kw));
      if (!hasInterference) {
        return { score: 100, detail: 'no_interference_extraction: ✓ 未提取干扰内容（实现建议/无关讨论）' };
      }
      return { score: 0, detail: 'no_interference_extraction: 提取了干扰内容（实现建议或无关讨论）' };
    },
    empty_output_handled: (records, rawAnswer) => {
      const trimmed = rawAnswer.trim();
      const isEmpty = trimmed === '' || trimmed === '[]' || trimmed === '{}' || records.length === 0;
      if (isEmpty) {
        return { score: 100, detail: 'empty_output_handled: ✓ 空输入正确返回空输出' };
      }
      return { score: 0, detail: `empty_output_handled: 空输入时应输出空内容，实际输出了 ${records.length} 条记录` };
    },
    no_fabricated_from_uncertain: (records) => {
      if (records.length === 0) return { score: 0, detail: 'no_fabricated_from_uncertain: 无记录可检查' };
      // LLM should NOT extract items marked [待讨论] or proposals
      const uncertainKeywords = ['推荐算法', '自动排课', '验证码', '待讨论', '还没定', '可以以后再议'];
      const extractedText = records.map(r => JSON.stringify(r)).join(' ');
      const hasUncertain = uncertainKeywords.some(kw => extractedText.includes(kw));
      if (!hasUncertain) {
        return { score: 100, detail: 'no_fabricated_from_uncertain: ✓ 未提取未确认内容' };
      }
      return { score: 0, detail: 'no_fabricated_from_uncertain: 提取了标记为待讨论/未确认的内容' };
    },
    special_chars_preserved: (records) => {
      if (records.length === 0) return { score: 0, detail: 'special_chars_preserved: 无记录可检查' };
      // Check that special characters are preserved (not corrupted or stripped)
      const hasSpecialChars = records.some(r => {
        const stmt = String(r.statement ?? '');
        return stmt.includes('😀') || stmt.includes('José') || stmt.includes('Müller') ||
          stmt.includes('!@#') || stmt.includes('%^&') || stmt.includes('出错');
      });
      if (hasSpecialChars) {
        return { score: 100, detail: 'special_chars_preserved: ✓ 特殊字符被正确保留' };
      }
      return { score: 0, detail: 'special_chars_preserved: 特殊字符丢失或损坏' };
    },
    template_refused: (_, rawAnswer) => {
      // LLM should refuse to extract when template asks for unrelated info
      const refusalKeywords = ['无法', '不能', '拒绝', '拒绝', '不存在', '没有', '无相关信息',
        'cannot', 'refuse', 'unable', 'decline', '不包含'];
      const asksWrongFields = rawAnswer.includes('student_name') || rawAnswer.includes('phone_number') || rawAnswer.includes('home_address');
      const isRefusal = refusalKeywords.some(kw => rawAnswer.includes(kw));
      // Perfect: points out the issue AND refuses
      if (isRefusal && asksWrongFields) {
        return { score: 100, detail: 'template_refused: ✓ 检测到错误模板并拒绝盲从' };
      }
      if (isRefusal) {
        return { score: 50, detail: 'template_refused: 指出了问题但仍尝试提取（部分正确）' };
      }
      return { score: 0, detail: 'template_refused: 盲从了错误模板，提取了 SRS 中不存在的字段' };
    },
  };

  return scoreJsonlRecords(probe, answer, checkMap);
}
