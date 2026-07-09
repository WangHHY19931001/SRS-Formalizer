/**
 * SRS document sharder — subdivides documents into shards for LLM processing.
 */

import type { ChapterInfo } from './chapter-parser.js';

export const MAX_SHARD_LINES = 200;

export function estimateTokens(text: string, lang: 'zh' | 'en'): number {
  if (lang === 'zh') return Math.ceil(text.replace(/\s/g, '').length / 1.5);
  return Math.ceil(text.length / 4);
}

export interface ShardDraft {
  locator: string; module: string; chapter_ref: string;
  source_path: string; source_start_line: number; source_end_line: number;
  char_count: number; estimated_tokens: number;
}

export function createShardEntry(
  absPath: string, startLine: number, endLine: number, module: string,
  chapterRef: string, lines: string[], lang: 'zh' | 'en', chunkId: string,
): ShardDraft {
  const shardLines = lines.slice(startLine - 1, endLine);
  const shardText = shardLines.join('\n');
  return {
    locator: `${absPath}-${startLine}-${endLine}-${chunkId}`, module, chapter_ref: chapterRef,
    source_path: absPath, source_start_line: startLine, source_end_line: endLine,
    char_count: shardText.length, estimated_tokens: estimateTokens(shardText, lang),
  };
}

export function subdivideShard(
  lines: string[], startLine: number, endLine: number, absPath: string,
  allChapters: ChapterInfo[], minLevel: number, lang: 'zh' | 'en',
): ShardDraft[] {
  const lineCount = endLine - startLine + 1;
  if (lineCount <= MAX_SHARD_LINES) return [createShardEntry(absPath, startLine, endLine, 'root', 'root', lines, lang, `${startLine}`)];

  const subChapters = allChapters.filter(c => c.line >= startLine && c.line <= endLine && c.level > minLevel);
  if (subChapters.length === 0) return forceSplitByParagraphs(lines, startLine, endLine, absPath, lang);

  const shards: ShardDraft[] = [];
  let prevEnd = startLine;
  for (const ch of subChapters) {
    if (ch.line > prevEnd) {
      const preShards = subdivideShard(lines, prevEnd, ch.line - 1, absPath, allChapters, minLevel + 1, lang);
      shards.push(...preShards);
    }
    const seg = createShardEntry(absPath, ch.line, Math.min(ch.line + MAX_SHARD_LINES, endLine), 'chapter', ch.title, lines, lang, `${ch.line}`);
    shards.push(seg);
    prevEnd = Math.min(ch.line + MAX_SHARD_LINES, endLine) + 1;
  }
  if (prevEnd <= endLine) {
    const tailShards = subdivideShard(lines, prevEnd, endLine, absPath, allChapters, minLevel + 1, lang);
    shards.push(...tailShards);
  }
  return shards;
}

export function forceSplitByParagraphs(lines: string[], startLine: number, endLine: number, absPath: string, lang: 'zh' | 'en'): ShardDraft[] {
  const shards: ShardDraft[] = [];
  let segStart = startLine;
  let blankCount = 0;

  for (let i = startLine; i <= endLine; i++) {
    if (lines[i - 1]?.trim() === '') blankCount++;
    if (blankCount >= 3 && i - segStart + 1 >= 50) {
      shards.push(createShardEntry(absPath, segStart, i - 1, 'paragraph', `L${segStart}-${i - 1}`, lines, lang, `${segStart}`));
      segStart = i + 1;
      blankCount = 0;
    }
  }
  if (segStart <= endLine) shards.push(createShardEntry(absPath, segStart, endLine, 'paragraph', `L${segStart}-${endLine}`, lines, lang, `${segStart}`));
  return shards;
}

export function buildShardIndex(absSrc: string, content: string, chapters: ChapterInfo[], lang: 'zh' | 'en'): ShardDraft[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return [];

  return subdivideShard(lines, 1, lines.length, absSrc, chapters, 0, lang);
}
