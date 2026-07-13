import type { ChapterInfo } from './parser.js';
import { computeNFRWeight } from './nfr-keywords.js';
import type { NFRProfile, CrossRef } from '../../types/srs-ir.js';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

export const MAX_SHARD_LINES = 200;

interface ShardDraft {
  locator: string;
  module: string;
  chapter_ref: string;
  source_path: string;
  source_start_line: number;
  source_end_line: number;
  char_count: number;
  estimated_tokens: number;
  nfr_weight: number;
}

export interface ShardEntry {
  id: string;
  file: string;
  locator: string;
  source_path: string;
  source_start_line: number;
  source_end_line: number;
  module: string;
  chapter_ref: string;
  char_count: number;
  estimated_tokens: number;
  nfr_weight?: number;
}

export interface ShardIndex {
  version: '1.1';
  source_path: string;
  source_hash: string;
  language: 'zh' | 'en';
  total_chars: number;
  total_shards: number;
  shards: ShardEntry[];
  gaps: GapEntry[];
  warnings: string[];
  cross_references: CrossRef[];
  nfr_profile: NFRProfile;
}

export interface GapEntry {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: string;
  description: string;
  source_chapter: string;
}

function estimateTokens(text: string, lang: 'zh' | 'en'): number {
  const chars = text.length;
  if (lang === 'zh') return Math.ceil(chars / 1.5);
  return Math.ceil(chars / 4);
}

function createShardEntry(
  absPath: string,
  startLine: number,
  endLine: number,
  module: string,
  chapterRef: string,
  lines: string[],
  lang: 'zh' | 'en',
): ShardDraft {
  const text = lines.join('\n');
  const charCount = text.length;
  return {
    locator: `${module || 'root'}:L${startLine + 1}-${endLine + 1}`,
    module,
    chapter_ref: chapterRef,
    source_path: absPath,
    source_start_line: startLine + 1,
    source_end_line: endLine + 1,
    char_count: charCount,
    estimated_tokens: estimateTokens(text, lang),
    nfr_weight: computeNFRWeight(text, lang),
  };
}

function forceSplitByParagraphs(
  lines: string[],
  startLine: number,
  endLine: number,
  absPath: string,
  lang: 'zh' | 'en',
): ShardDraft[] {
  const result: ShardDraft[] = [];
  for (let pos = startLine; pos <= endLine; pos += MAX_SHARD_LINES) {
    const chunkEnd = Math.min(pos + MAX_SHARD_LINES - 1, endLine);
    const chunkLines = lines.slice(pos, chunkEnd + 1);
    result.push(createShardEntry(absPath, pos, chunkEnd, '', '', chunkLines, lang));
  }
  return result;
}

function subdivideShard(
  lines: string[],
  startLine: number,
  endLine: number,
  absPath: string,
  allChapters: ChapterInfo[],
  minLevel: number,
  lang: 'zh' | 'en',
): ShardDraft[] {
  const lineCount = endLine - startLine + 1;
  if (lineCount <= MAX_SHARD_LINES) {
    const shardLines = lines.slice(startLine, endLine + 1);
    return [createShardEntry(absPath, startLine, endLine, '', '', shardLines, lang)];
  }

  const rangeChapters = allChapters.filter(c => c.line >= startLine && c.line <= endLine);
  if (rangeChapters.length === 0) {
    return forceSplitByParagraphs(lines, startLine, endLine, absPath, lang);
  }

  let chaptersAtLevel = rangeChapters.filter(c => c.level === minLevel);
  if (chaptersAtLevel.length === 0) {
    const levels = rangeChapters.map(c => c.level);
    const nextLevel = Math.min(...levels);
    chaptersAtLevel = rangeChapters.filter(c => c.level === nextLevel);
    return subdivideShard(lines, startLine, endLine, absPath, allChapters, nextLevel, lang);
  }

  const result: ShardDraft[] = [];
  let prevEnd = startLine - 1;

  for (const ch of chaptersAtLevel) {
    if (ch.line > prevEnd + 1) {
      const before = subdivideShard(
        lines, prevEnd + 1, ch.line - 1, absPath, allChapters, minLevel + 1, lang,
      );
      result.push(...before);
    }

    const nextCh = chaptersAtLevel.find(c => c.line > ch.line);
    const chEnd = nextCh ? nextCh.line - 1 : endLine;
    const chLines = lines.slice(ch.line, chEnd + 1);
    const chLineCount = chEnd - ch.line + 1;
    const module = ch.title;
    const chapterRef = ch.raw;

    if (chLineCount <= MAX_SHARD_LINES) {
      result.push(createShardEntry(absPath, ch.line, chEnd, module, chapterRef, chLines, lang));
    } else {
      const subShards = subdivideShard(
        lines, ch.line, chEnd, absPath, allChapters, minLevel + 1, lang,
      );
      for (const s of subShards) {
        result.push({
          locator: s.locator,
          module: s.module || module,
          chapter_ref: s.chapter_ref || chapterRef,
          source_path: s.source_path,
          source_start_line: s.source_start_line,
          source_end_line: s.source_end_line,
          char_count: s.char_count,
          estimated_tokens: s.estimated_tokens,
          nfr_weight: s.nfr_weight,
        });
      }
    }
    prevEnd = chEnd;
  }

  if (prevEnd < endLine) {
    const trailing = subdivideShard(
      lines, prevEnd + 1, endLine, absPath, allChapters, minLevel + 1, lang,
    );
    result.push(...trailing);
  }

  return result;
}

function detectGaps(content: string, chapters: ChapterInfo[]): GapEntry[] {
  const gaps: GapEntry[] = [];
  const hasUnsolved =
    /(?:尚未解决|待定|TBD|TODO|FIXME|Open Issues|Unresolved)/i.test(content);
  if (hasUnsolved) {
    const sourceChapter =
      chapters.find(c => c.title === '尚未解决问题')?.title ??
      chapters[0]?.title ??
      '';
    gaps.push({
      priority: 'P1',
      type: 'unsolved_issue',
      description: 'Document contains unresolved items (TBD/TODO/尚未解决)',
      source_chapter: sourceChapter,
    });
  }
  const hasGlossary = chapters.some(c => c.title === '术语表');
  if (!hasGlossary) {
    gaps.push({
      priority: 'P2',
      type: 'undefined_term',
      description: 'No glossary section found',
      source_chapter: chapters[0]?.title ?? '',
    });
  }
  return gaps;
}

export function buildShardIndex(
  absSrc: string,
  content: string,
  chapters: ChapterInfo[],
  lang: 'zh' | 'en',
  nfrProfile: NFRProfile,
): ShardIndex {
  const lines = content.split('\n');
  const sourceHash = createHash('sha256').update(content).digest('hex').substring(0, 16);

  let drafts: ShardDraft[];
  if (content.trim().length === 0) {
    drafts = [];
  } else {
    const minLevel =
      chapters.length > 0 ? Math.min(...chapters.map(c => c.level)) : 1;
    drafts = subdivideShard(
      lines, 0, lines.length - 1, absSrc, chapters, minLevel, lang,
    );
  }

  const shortName = path.basename(absSrc, path.extname(absSrc));
  const shards: ShardEntry[] = drafts.map((draft, i) => {
    const startIdx = draft.source_start_line - 1;
    const endIdx = draft.source_end_line;
    const text = lines.slice(startIdx, endIdx).join('\n');
    const hash = createHash('sha256').update(text).digest('hex').substring(0, 8);
    const id = `${shortName}-${i}-${hash}`;
    return {
      id,
      file: `${shortName}-s${String(i).padStart(3, '0')}.md`,
      locator: draft.locator,
      source_path: draft.source_path,
      source_start_line: draft.source_start_line,
      source_end_line: draft.source_end_line,
      module: draft.module,
      chapter_ref: draft.chapter_ref,
      char_count: draft.char_count,
      estimated_tokens: draft.estimated_tokens,
      nfr_weight: draft.nfr_weight,
    };
  });

  const gaps = detectGaps(content, chapters);

  return {
    version: '1.1',
    source_path: absSrc,
    source_hash: sourceHash,
    language: lang,
    total_chars: content.length,
    total_shards: shards.length,
    shards,
    gaps,
    warnings: [],
    cross_references: [],
    nfr_profile: nfrProfile,
  };
}
