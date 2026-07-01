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

function buildShardIndex(
  content: string,
  chapters: ChapterInfo[],
  sourcePath: string,
  lang: 'zh' | 'en',
): ShardEntry[] {
  const lines = content.split('\n');
  const absPath = path.resolve(sourcePath);
  const entries: ShardEntry[] = [];

  const moduleChapters = chapters.filter(ch => ch.level === 2 || ch.level === 3);

  if (moduleChapters.length === 0) {
    // Full file as single shard
    const charCount = content.length;
    entries.push({
      id: '', file: '',  // filled in by main() during renumbering
      locator: `${absPath}-1-${lines.length}-001`,
      module: '全文',
      chapter_ref: '全文',
      source_path: absPath,
      source_start_line: 1,
      source_end_line: lines.length,
      char_count: charCount,
      estimated_tokens: estimateTokens(content, lang),
    });
    return entries;
  }

  for (let i = 0; i < moduleChapters.length; i++) {
    const ch = moduleChapters[i]!;
    const nextCh = moduleChapters[i + 1];
    const startLine = ch.line + 1;   // 1-based
    const endLine = nextCh ? nextCh.line : lines.length;

    const shardLines = lines.slice(startLine - 1, endLine);
    const shardText = shardLines.join('\n');
    const chunkId = '001';

    entries.push({
      id: '', file: '',
      locator: `${absPath}-${startLine}-${endLine}-${chunkId}`,
      module: ch.title,
      chapter_ref: ch.raw,
      source_path: absPath,
      source_start_line: startLine,
      source_end_line: endLine,
      char_count: shardText.length,
      estimated_tokens: estimateTokens(shardText, lang),
    });
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
