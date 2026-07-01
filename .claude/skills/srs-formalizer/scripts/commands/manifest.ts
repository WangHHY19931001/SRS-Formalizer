/**
 * manifest.ts — SRS 分片 + 章节识别 + 信息缺口检测
 *
 * CLI: npx tsx index.ts manifest --src <path> --lang zh|en --workdir .srs_formalizer
 *
 * 分片流程：收集源文件 → 逐文件章节识别 → 构建索引（不生成物理分片文件）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult, ShardIndex, ShardEntry, GapEntry } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

function collectSourceFiles(absSrc: string): string[] {
  const stat = fs.statSync(absSrc);

  if (!stat.isDirectory()) {
    return [absSrc];
  }

  // Directory: collect all .md and .html files (do NOT merge)
  const files = fs.readdirSync(absSrc)
    .filter(f => /\.(md|html|htm)$/i.test(f))
    .sort()
    .map(f => path.join(absSrc, f));

  if (files.length === 0) {
    return [absSrc];
  }
  return files;
}

interface ChapterInfo {
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
];

function identifyChaptersHtml(content: string): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  const lines = content.split('\n');

  const headingRe = /<h([1-6])(?:\s+[^>]*?\bid\s*=\s*["']([^"']+)["'])?[^>]*>(.*?)<\/h\1>/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    headingRe.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = headingRe.exec(line)) !== null) {
      const level = parseInt(match[1]!, 10);
      const idAttr = match[2] || undefined;
      const title = match[3]!.replace(/<[^>]+>/g, '').trim();

      chapters.push({
        title: title || (idAttr || `h${level}`),
        level,
        line: i,
        raw: line.trim(),
      });
    }
  }

  return chapters;
}

function identifyChapters(content: string, sourcePath: string): ChapterInfo[] {
  if (sourcePath.endsWith('.html') || sourcePath.endsWith('.htm')) {
    return identifyChaptersHtml(content);
  }
  // Markdown logic
  const chapters: ChapterInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const sectionMatch = line.match(/^#{1,6}\s*(?:§(\d+(?:\.\d+)*))?\s*(.+)$/);
    if (sectionMatch) {
      let title = (sectionMatch[2] || '').trim();
      // If a keyword pattern matches, use the standardized keyword name
      for (const kw of KEYWORD_PATTERNS) {
        if (kw.pattern.test(line)) {
          title = kw.name;
          break;
        }
      }
      chapters.push({
        title,
        level: line.match(/^#+/)![0]!.length,
        line: i,
        raw: line.trim(),
      });
      continue;
    }
    for (const kw of KEYWORD_PATTERNS) {
      if (kw.pattern.test(line) && line.startsWith('#')) {
        chapters.push({
          title: kw.name,
          level: line.match(/^#+/)![0]!.length,
          line: i,
          raw: line.trim(),
        });
        break;
      }
    }
  }

  return chapters;
}

function estimateTokens(text: string, lang: 'zh' | 'en'): number {
  if (lang === 'zh') {
    return Math.ceil(text.replace(/\s/g, '').length / 1.5);
  }
  return Math.ceil(text.length / 4);
}

/** Maximum lines per shard. Shards exceeding this are recursively subdivided. */
const MAX_SHARD_LINES = 200;

/** Create a single ShardEntry (helper deduplicates the repeated locator/chunk logic). */
function createShardEntry(
  absPath: string,
  startLine: number,
  endLine: number,
  module: string,
  chapterRef: string,
  lines: string[],
  lang: 'zh' | 'en',
  chunkId: string,
): ShardEntry {
  const shardLines = lines.slice(startLine - 1, endLine);
  const shardText = shardLines.join('\n');
  return {
    id: '', file: '',
    locator: `${absPath}-${startLine}-${endLine}-${chunkId}`,
    module,
    chapter_ref: chapterRef,
    source_path: absPath,
    source_start_line: startLine,
    source_end_line: endLine,
    char_count: shardText.length,
    estimated_tokens: estimateTokens(shardText, lang),
  };
}

/**
 * Recursively subdivide a line range until every resulting shard is ≤ MAX_SHARD_LINES.
 * Uses the `allChapters` array to find sub-headings within the range.
 * Falls back to force-splitting by paragraph boundaries when no sub-headings exist.
 */
function subdivideShard(
  lines: string[],
  startLine: number,
  endLine: number,
  absPath: string,
  allChapters: ChapterInfo[],
  minLevel: number,
  lang: 'zh' | 'en',
  parentChunkPrefix: string,
): ShardEntry[] {
  const lineCount = endLine - startLine + 1;

  // Base case: small enough
  if (lineCount <= MAX_SHARD_LINES) {
    return [createShardEntry(absPath, startLine, endLine, '（小分片）', '—', lines, lang, parentChunkPrefix)];
  }

  // Find sub-chapters within this range at the requested level or deeper
  const subChapters = allChapters.filter(
    ch => ch.level >= minLevel && ch.line >= startLine - 1 && ch.line < endLine,
  );

  if (subChapters.length === 0) {
    // No sub-headings available → force-split by double-newline paragraph boundaries
    return forceSplitByParagraphs(lines, startLine, endLine, absPath, lang, parentChunkPrefix);
  }

  const entries: ShardEntry[] = [];
  let chunkCounter = 0;

  for (let i = 0; i < subChapters.length; i++) {
    const ch = subChapters[i]!;
    const nextCh = subChapters[i + 1];
    const segStart = ch.line + 1; // 1-based
    const segEnd = nextCh ? nextCh.line : endLine;
    const segLines = segEnd - segStart + 1;
    const chunkId = `${parentChunkPrefix}-${String(chunkCounter).padStart(2, '0')}`;

    if (segLines <= MAX_SHARD_LINES) {
      entries.push(createShardEntry(absPath, segStart, segEnd, ch.title, ch.raw, lines, lang, chunkId));
    } else {
      // Still too large → recurse with the NEXT heading level
      const deeper = subdivideShard(lines, segStart, segEnd, absPath, allChapters, ch.level + 1, lang, chunkId);
      entries.push(...deeper);
    }
    chunkCounter++;
  }

  return entries;
}

/**
 * Fallback: split a line range by double-newline (paragraph) boundaries
 * until each piece is ≤ MAX_SHARD_LINES. If a single paragraph still exceeds
 * the limit, hard-split it at exactly MAX_SHARD_LINES.
 */
function forceSplitByParagraphs(
  lines: string[],
  startLine: number,
  endLine: number,
  absPath: string,
  lang: 'zh' | 'en',
  parentChunkPrefix: string,
): ShardEntry[] {
  const entries: ShardEntry[] = [];
  let segStart = startLine;
  let chunkCounter = 0;

  for (let i = startLine; i <= endLine; i++) {
    // Detect paragraph boundary: empty line or end of range
    const isBoundary = i === endLine || (lines[i - 1]?.trim() === '' && i > startLine);

    if (!isBoundary) continue;

    const segEnd = i;
    const segLines = segEnd - segStart + 1;

    if (segLines <= MAX_SHARD_LINES) {
      if (segLines > 0) {
        const chunkId = `${parentChunkPrefix}-P${String(chunkCounter).padStart(2, '0')}`;
        entries.push(createShardEntry(absPath, segStart, segEnd, '（段落分片）', '—', lines, lang, chunkId));
        chunkCounter++;
      }
      segStart = i + 1;
    } else {
      // Single paragraph too large → hard-split into MAX_SHARD_LINES chunks
      while (segStart <= segEnd) {
        const hardEnd = Math.min(segStart + MAX_SHARD_LINES - 1, segEnd);
        const chunkId = `${parentChunkPrefix}-H${String(chunkCounter).padStart(2, '0')}`;
        entries.push(createShardEntry(absPath, segStart, hardEnd, '（硬分片）', '—', lines, lang, chunkId));
        chunkCounter++;
        segStart = hardEnd + 1;
      }
      segStart = i + 1;
    }
  }

  return entries;
}

function buildShardIndex(
  content: string,
  chapters: ChapterInfo[],
  sourcePath: string,
  lang: 'zh' | 'en',
): ShardEntry[] {
  const lines = content.split('\n');
  const absPath = path.resolve(sourcePath);

  // Initial split: use level-2 and level-3 headings as top-level boundaries
  const topChapters = chapters.filter(ch => ch.level === 2 || ch.level === 3);

  // No chapters found → whole file, but still subdivide if > MAX_SHARD_LINES
  if (topChapters.length === 0) {
    const lineCount = lines.length;
    if (lineCount <= MAX_SHARD_LINES) {
      return [createShardEntry(absPath, 1, lines.length, '全文', '全文', lines, lang, '001')];
    }
    return subdivideShard(lines, 1, lines.length, absPath, chapters, 1, lang, '000');
  }

  const entries: ShardEntry[] = [];

  for (let i = 0; i < topChapters.length; i++) {
    const ch = topChapters[i]!;
    const nextCh = topChapters[i + 1];
    const startLine = ch.line + 1;   // 1-based, line after the heading
    const endLine = nextCh ? nextCh.line : lines.length;
    const lineCount = endLine - startLine + 1;

    if (lineCount <= MAX_SHARD_LINES) {
      entries.push(createShardEntry(absPath, startLine, endLine, ch.title, ch.raw, lines, lang, '001'));
    } else {
      // Too large → recursively subdivide using deeper headings
      const subEntries = subdivideShard(lines, startLine, endLine, absPath, chapters, ch.level + 1, lang, '001');
      entries.push(...subEntries);
    }
  }

  return entries;
}

function detectGaps(content: string, chapters: ChapterInfo[]): GapEntry[] {
  const gaps: GapEntry[] = [];

  const unresolvedChapter = chapters.find(ch => ch.title === '尚未解决问题');
  if (unresolvedChapter) {
    const lines = content.split('\n');
    const startLine = unresolvedChapter.line + 1;
    let endLine = lines.length;
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i]!.match(new RegExp(`^#{1,${unresolvedChapter.level}}\\s`))) {
        endLine = i;
        break;
      }
    }
    const sectionContent = lines.slice(startLine, endLine).join('\n').trim();
    if (sectionContent && sectionContent !== '（无）' && sectionContent !== '(none)') {
      const issues = sectionContent.split('\n').filter(l => l.match(/^\d+\.\s/));
      for (const issue of issues) {
        gaps.push({
          priority: 'P0',
          type: 'unsolved_issue',
          description: issue.replace(/^\d+\.\s*/, '').trim(),
          source_chapter: '§7',
        });
      }
    }
  }

  const glossary = chapters.find(ch => ch.title === '术语表');
  if (!glossary) {
    gaps.push({
      priority: 'P1',
      type: 'undefined_term',
      description: 'SRS 未包含术语表章节',
      source_chapter: '§1.4',
    });
  }

  return gaps;
}

function generateContext(shards: ShardEntry[], gaps: GapEntry[], content: string): string {
  const termMatch = content.match(/\|([^|]+)\|([^|]+)\|/g);
  const termSection = termMatch
    ? termMatch.slice(0, 20).map(m => {
        const parts = m.split('|').map(s => s.trim()).filter(Boolean);
        return `| ${parts[0] || '?'} | ${parts[1] || '?'} | — |`;
      }).join('\n')
    : '| — | — | — |';

  return `# CONTEXT — SRS 术语表与切片索引

## 术语表

| 术语 | 定义 | 来源章节 |
|------|------|----------|
${termSection}

## 模块切片索引

| 模块 | 分片文件 | Token 估算 |
|------|---------|-----------|
${shards.map(s => `| ${s.module} | ${s.file} | ${s.estimated_tokens} |`).join('\n')}

## 信息缺口

${gaps.length > 0
  ? gaps.map(g => `- [${g.priority}] ${g.description}（${g.source_chapter}）`).join('\n')
  : '（无已检测到的缺口）'}
`;
}

export async function main(args: string[]): Promise<CliResult> {
  let srcPath: string | null;
  let lang: string;
  let workDirArg: string | null;
  try {
    srcPath = safeParseArg(args, '--src');
    lang = safeParseArg(args, '--lang') || 'zh';
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!srcPath) {
    return { status: 'error', message: 'Missing required argument: --src' };
  }
  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }
  if (lang !== 'zh' && lang !== 'en') {
    return { status: 'error', message: `Invalid --lang: "${lang}". Must be "zh" or "en".` };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const absSrc = path.resolve(srcPath);
  if (!fs.existsSync(absSrc)) {
    return { status: 'error', message: `Source file not found: ${absSrc}` };
  }

  // Collect source files
  const sourceFiles = collectSourceFiles(absSrc);
  const allShards: ShardEntry[] = [];
  const warnings: string[] = [];
  let totalGaps: GapEntry[] = [];

  for (const sourcePath of sourceFiles) {
    let content: string;
    try {
      content = fs.readFileSync(sourcePath, 'utf-8');
    } catch (err) {
      return { status: 'error', message: `Failed to read ${sourcePath}: ${(err as Error).message}` };
    }

    // HTML files: keep raw content, do NOT strip tags
    const chapters = identifyChapters(content, sourcePath);
    if (chapters.length === 0) {
      warnings.push(`${sourcePath}: 未识别到章节，全文作为单分片`);
    }

    const shards = buildShardIndex(content, chapters, sourcePath, lang);
    allShards.push(...shards);

    const fileGaps = detectGaps(content, chapters);
    totalGaps = totalGaps.concat(fileGaps);
  }

  // Renumber shards with sequential IDs
  for (let i = 0; i < allShards.length; i++) {
    const s = allShards[i]!;
    s.id = `S${String(i + 1).padStart(3, '0')}`;
    s.file = s.id;
  }

  // Write shard_index.json (no 1_shard/ directory)
  const sourceHash = crypto.createHash('sha256').update(
    sourceFiles.map(f => fs.readFileSync(f, 'utf-8')).join('')
  ).digest('hex');

  const index: ShardIndex = {
    version: '1.1',
    source_path: absSrc,
    source_hash: sourceHash,
    language: lang,
    total_chars: allShards.reduce((sum, s) => sum + s.char_count, 0),
    total_shards: allShards.length,
    shards: allShards,
    gaps: totalGaps,
    warnings,
  };

  const ctxDir = path.join(workDir, '_ctx');
  if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(path.join(ctxDir, 'shard_index.json'), JSON.stringify(index, null, 2), 'utf-8');

  fs.writeFileSync(path.join(workDir, 'CONTEXT.md'), generateContext(allShards, totalGaps, sourceFiles.map(f => fs.readFileSync(f, 'utf-8')).join('\n\n')), 'utf-8');

  const gapsContent = `# GAPS — 信息缺口追踪

## 缺口清单

${totalGaps.map((g, i) =>
  `| GAP-${String(i + 1).padStart(3, '0')} | ${g.priority} | ${g.type} | ${g.description} | ${g.source_chapter} | — | — | 待处理 |`
).join('\n')}
${totalGaps.length === 0 ? '（无已检测到的缺口）' : ''}
`;
  fs.writeFileSync(path.join(workDir, 'GAPS.md'), gapsContent, 'utf-8');

  return {
    status: 'ok',
    data: { shard_count: allShards.length, gap_count: totalGaps.length, source_hash: sourceHash },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
