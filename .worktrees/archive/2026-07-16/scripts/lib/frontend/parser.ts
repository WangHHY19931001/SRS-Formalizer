import type { CrossRef, NFRCategory, NFRProfile } from '../../types/srs-ir.js';
import { detectNFRCategories } from './nfr-keywords.js';

export interface ChapterInfo {
  title: string;
  level: number;
  line: number;
  raw: string;
}

const KEYWORD_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /术语[表定]|Glossary|Terms/i, name: '术语表' },
  { pattern: /模块能力[矩阵]|Capability Matrix/i, name: '模块能力矩阵' },
  { pattern: /功能[需求规格]|Functional Requirements/i, name: '功能需求' },
  { pattern: /尚未[解决决].*问题|Open Issues|Unresolved/i, name: '尚未解决问题' },
  { pattern: /技术[选型方案]|Technology Stack|Architecture/i, name: '技术选型' },
  { pattern: /性能.*(?:需求|指标|要求)|Performance/i, name: '性能需求' },
  { pattern: /安全.*(?:需求|指标|要求)|Security/i, name: '安全需求' },
  { pattern: /可用性.*(?:需求|指标|要求)|Availability/i, name: '可用性需求' },
  { pattern: /兼容性.*(?:需求|指标|要求)|Compatibility/i, name: '兼容性需求' },
  { pattern: /可维护.*(?:需求|指标|要求)|Maintainability/i, name: '可维护性需求' },
  { pattern: /合规.*(?:需求|指标|要求)|Compliance/i, name: '合规需求' },
  { pattern: /非功能[性]?需求|Non.?Functional/i, name: '非功能需求' },
];

export function identifyChapters(content: string, _sourcePath: string): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const sectionMatch = line.match(/^#{1,6}\s*(?:§(\d+(?:\.\d+)*))?\s*(.+)$/);
    if (sectionMatch) {
      const rawTitle = sectionMatch[2];
      if (rawTitle === undefined) continue;
      let title = rawTitle.trim();
      for (const kw of KEYWORD_PATTERNS) {
        if (kw.pattern.test(line)) { title = kw.name; break; }
      }
      const hashMatch = line.match(/^#+/);
      const level = hashMatch ? hashMatch[0].length : 1;
      chapters.push({ title, level, line: i, raw: line.trim() });
      continue;
    }
    for (const kw of KEYWORD_PATTERNS) {
      if (kw.pattern.test(line) && line.startsWith('#')) {
        const hashMatch = line.match(/^#+/);
        const level = hashMatch ? hashMatch[0].length : 1;
        chapters.push({ title: kw.name, level, line: i, raw: line.trim() });
        break;
      }
    }
  }
  return chapters;
}

export function detectCrossRefs(content: string, chapters: ChapterInfo[]): CrossRef[] {
  const refs: CrossRef[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const seeMatch = line.match(/(?:参见|引用|见)\s*(§[\d.]+|第[一二三四五六七八九十\d]+[章节])/);
    if (seeMatch) {
      const anchorText = seeMatch[1];
      if (anchorText === undefined) continue;
      const sourceChapter = chapters.filter(c => c.line <= i).pop();
      const targetChapter = chapters.find(c => c.raw.includes(anchorText));
      if (sourceChapter && targetChapter && sourceChapter.title !== targetChapter.title) {
        refs.push({
          sourceShard: sourceChapter.title,
          targetShard: targetChapter.title,
          refType: 'explicit_see',
          anchorText,
          confidence: 0.9,
        });
      }
    }
    const refMatch = line.match(/(?:§[\d.]+)/g);
    if (refMatch && !line.startsWith('#') && !seeMatch) {
      for (const ref of refMatch) {
        const sourceChapter = chapters.filter(c => c.line <= i).pop();
        const targetChapter = chapters.find(c => c.raw.includes(ref));
        if (sourceChapter && targetChapter && sourceChapter.title !== targetChapter.title) {
          refs.push({
            sourceShard: sourceChapter.title,
            targetShard: targetChapter.title,
            refType: 'heading_ref',
            anchorText: ref,
            confidence: 0.7,
          });
        }
      }
    }
  }

  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.includes('| 术语 |') || line.includes('| Term |')) { inTable = true; continue; }
    if (inTable && line.startsWith('|') && !line.includes('---')) {
      const parts = line.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const term = parts[0];
        if (term === undefined) continue;
        const sourceChapter = chapters.filter(c => c.line <= i).pop();
        for (const ch of chapters) {
          if (sourceChapter && ch.title !== sourceChapter.title) {
            refs.push({
              sourceShard: sourceChapter.title,
              targetShard: ch.title,
              refType: 'term_ref',
              anchorText: term,
              confidence: 0.5,
            });
          }
        }
      }
    }
    if (inTable && !line.startsWith('|')) inTable = false;
  }
  return refs;
}

export function scanNFR(content: string, lang: 'zh' | 'en'): NFRProfile {
  const allCategories: NFRCategory[] = [
    'performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance',
  ];
  const lines = content.split('\n');
  const categoryHits = new Map<NFRCategory, number>();
  for (const line of lines) {
    const cats = detectNFRCategories(line, lang);
    for (const c of cats) {
      categoryHits.set(c, (categoryHits.get(c) ?? 0) + 1);
    }
  }
  const detectedCategories = [];
  for (const [category, keywordHits] of categoryHits) {
    detectedCategories.push({ category, keywordHits, shardIds: [], nodeIds: [] });
  }
  const detectedCount = detectedCategories.length;
  const overallCoverage = detectedCount / allCategories.length;
  const blindSpots = allCategories.filter(c => !categoryHits.has(c));
  return { detectedCategories, weightedShards: [], overallCoverage, blindSpots };
}
