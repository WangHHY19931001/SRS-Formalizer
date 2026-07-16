/**
 * scorer/structured-output.ts — Scoring for structured_output dimension
 */

import type { ProbeItem, ProbeResult } from '../types.js';
import { scoreJsonlRecords } from './helpers.js';

const REQUIRED_FIELDS = ['id', 'category', 'statement', 'source_file', 'confidence'];

export function scoreStructuredOutput(probe: ProbeItem, answer: string): ProbeResult {
  const checkMap: Record<string, (records: Record<string, unknown>[], rawAnswer: string) => { score: number; detail: string }> = {
    valid_json: () => {
      const rawLines = answer.split('\n').filter((l) => l.trim() !== '');
      if (rawLines.length === 0) return { score: 0, detail: 'valid_json: 无输入' };
      const validCount = rawLines.filter((l) => {
        try {
          const p = JSON.parse(l.trim());
          return typeof p === 'object' && p !== null && !Array.isArray(p);
        } catch {
          return false;
        }
      }).length;
      const pct = Math.round((validCount / rawLines.length) * 100);
      return { score: pct, detail: `valid_json: ${validCount}/${rawLines.length} 行合法 JSON (${pct}%)` };
    },
    required_fields: (records) => {
      if (records.length === 0) return { score: 0, detail: 'required_fields: 无记录可检查' };
      const passed = records.filter((r) => REQUIRED_FIELDS.every((f) => r[f] !== undefined && r[f] !== null && r[f] !== ''));
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `required_fields: ${passed.length}/${records.length} 条记录包含全部必填字段 (${pct}%)` };
    },
    nested_metadata_preserved: (records) => {
      if (records.length === 0) return { score: 0, detail: 'nested_metadata_preserved: 无记录可检查' };
      // Check that at least one metadata has nested objects/arrays (not just flat {})
      const hasNested = records.some((r) => {
        const m = r.metadata;
        if (m === undefined || m === null || (typeof m === 'object' && Object.keys(m as object).length === 0)) return false;
        if (typeof m !== 'object' || Array.isArray(m)) return true; // complex
        // Check for nested objects inside metadata
        return Object.values(m as Record<string, unknown>).some(v => typeof v === 'object' && v !== null);
      });
      if (hasNested) {
        return { score: 100, detail: 'nested_metadata_preserved: ✓ metadata 包含嵌套结构' };
      }
      return { score: 0, detail: 'nested_metadata_preserved: metadata 缺少嵌套对象（priority/module/contacts/tags）' };
    },
    unicode_handled: (records) => {
      if (records.length === 0) return { score: 0, detail: 'unicode_handled: 无记录可检查' };
      const statements = records.map(r => String(r.statement ?? '')).join('');
      const hasUnicodeNames = statements.includes('José') || statements.includes('Müller') || statements.includes('李小龙');
      const hasMixed = (statements.includes('student') || statements.includes('API')) &&
        (statements.includes('登录') || statements.includes('系统'));
      if (hasUnicodeNames || hasMixed) {
        return { score: 100, detail: 'unicode_handled: ✓ 中英混合和 Unicode 字符被正确保留' };
      }
      return { score: 0, detail: 'unicode_handled: Unicode 字符丢失或混合语言未保留' };
    },
    contradiction_resolved: (records, _rawAnswer) => {
      if (records.length === 0) return { score: 0, detail: 'contradiction_resolved: 无记录可检查' };
      // Check LLM adopted the revision for FR-004 (第六周 not 第四周) and excluded unconfirmed items
      const allText = records.map(r => JSON.stringify(r)).join(' ');
      const hasCorrectWeek = allText.includes('第六周') && !allText.includes('第四周');
      const hasNoRejected = !allText.includes('邮箱+密码') && !allText.includes('抢课模式');
      if (hasCorrectWeek && hasNoRejected) {
        return { score: 100, detail: 'contradiction_resolved: ✓ 正确处理矛盾信息（采纳确认的修改，排除否决意见）' };
      }
      if (hasCorrectWeek) {
        return { score: 50, detail: 'contradiction_resolved: 部分正确处理矛盾（采纳了修改但可能包含了未确认内容）' };
      }
      return { score: 0, detail: 'contradiction_resolved: 未正确处理矛盾信息（未采纳已批准修改或提取了否决意见）' };
    },
    long_text_no_truncation: (records, _rawAnswer) => {
      // Check coverage: LLM should cover requirements from all chapters (not just early ones)
      const chapterKeywords = ['密码', '课程创建', '容量', '先修课程', '预选', '退选', 'GPA', '评估', '备份', 'RBAC'];
      const allText = records.map(r => JSON.stringify(r)).join(' ');
      const covered = chapterKeywords.filter(kw => allText.includes(kw));
      const coveragePct = Math.round((covered.length / chapterKeywords.length) * 100);
      if (coveragePct >= 70) {
        return { score: 100, detail: `long_text_no_truncation: ✓ 覆盖所有章节 (${covered.length}/${chapterKeywords.length} 关键词匹配)` };
      }
      if (coveragePct >= 40) {
        return { score: 50, detail: `long_text_no_truncation: 部分覆盖 (${covered.length}/${chapterKeywords.length})` };
      }
      return { score: 0, detail: `long_text_no_truncation: 长文本截断或只处理了前几章 (${covered.length}/${chapterKeywords.length})` };
    },
  };

  return scoreJsonlRecords(probe, answer, checkMap);
}
