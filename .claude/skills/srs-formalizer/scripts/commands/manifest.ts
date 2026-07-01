/**
 * manifest.ts — SRS 分片 + 章节识别 + 信息缺口检测
 *
 * CLI: npx tsx index.ts manifest --src <path> --lang zh|en --workdir .srs_formalizer
 *
 * 五步：合并 → 章节识别 → 缺口检测 → Token 切分 → 写入产出
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult, ShardIndex, ShardEntry, GapEntry } from '../types/index.js';
import { validateWorkDir } from '../lib/security.js';

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
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

function identifyChapters(content: string): ChapterInfo[] {
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

function shardContent(
  content: string,
  chapters: ChapterInfo[],
  lang: 'zh' | 'en',
  sourcePath: string
): { shards: ShardEntry[]; shardContents: Map<string, string> } {
  const shardEntries: ShardEntry[] = [];
  const shardContents = new Map<string, string>();
  const lines = content.split('\n');
  const absPath = path.resolve(sourcePath);

  function makeHeader(id: string, startLine: number, endLine: number): string {
    return [
      `# shard_id: ${id}`,
      `# source: ${absPath}:${startLine + 1}-${endLine}`,
      `# total_shards: <TOTAL>`,
      '',
    ].join('\n');
  }

  const moduleChapters = chapters.filter(ch => ch.level === 2 || ch.level === 3);

  if (moduleChapters.length === 0) {
    const id = 'S001';
    const fileName = 'S001.md';
    const header = makeHeader(id, 0, lines.length);
    const fullContent = content;
    shardEntries.push({
      id, file: fileName, module: '全文', chapter_ref: '全文',
      source_path: absPath, source_start_line: 1, source_end_line: lines.length,
      locator: `${absPath}-1-${lines.length}-${id}`,
      char_count: fullContent.length, estimated_tokens: estimateTokens(fullContent, lang),
    });
    shardContents.set(fileName, header.replace('<TOTAL>', '1') + fullContent);
    return { shards: shardEntries, shardContents };
  }

  const total = moduleChapters.length;
  for (let i = 0; i < moduleChapters.length; i++) {
    const ch = moduleChapters[i]!;
    const nextCh = moduleChapters[i + 1];
    const startLine = ch.line;              // 0-based line index
    const endLine = nextCh ? nextCh.line : lines.length;

    const shardLines = lines.slice(startLine, endLine);
    const shardText = shardLines.join('\n');
    const id = `S${String(i + 1).padStart(3, '0')}`;
    const fileName = `S${String(i + 1).padStart(3, '0')}.md`;
    const header = makeHeader(id, startLine, endLine).replace('<TOTAL>', String(total));

    shardEntries.push({
      id, file: fileName, module: ch.title, chapter_ref: ch.raw,
      source_path: absPath,
      source_start_line: startLine + 1,  // 1-based for human reading
      source_end_line: endLine,          // endLine 已经在前面指向下一个章节起始行（1-based from lines array）
      locator: `${absPath}-${startLine + 1}-${endLine}-${id}`,
      char_count: shardText.length,
      estimated_tokens: estimateTokens(shardText, lang),
    });
    shardContents.set(fileName, header + shardText);
  }

  return { shards: shardEntries, shardContents };
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
  const srcPath = parseArg(args, '--src');
  const lang = (parseArg(args, '--lang') || 'zh') as 'zh' | 'en';
  const workDirArg = parseArg(args, '--workdir');

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

  let content: string;
  const stat = fs.statSync(absSrc);

  if (stat.isDirectory()) {
    const readmePath = path.join(absSrc, 'README.md');
    const indexPath = path.join(absSrc, 'index.md');
    const entryPath = fs.existsSync(readmePath) ? readmePath
      : fs.existsSync(indexPath) ? indexPath : null;

    if (entryPath) {
      content = fs.readFileSync(entryPath, 'utf-8');
    } else {
      const mdFiles = fs.readdirSync(absSrc).filter(f => f.endsWith('.md')).sort();
      content = mdFiles.map(f => fs.readFileSync(path.join(absSrc, f), 'utf-8')).join('\n\n');
    }
  } else {
    content = fs.readFileSync(absSrc, 'utf-8');
  }

  if (absSrc.endsWith('.html') || absSrc.endsWith('.htm')) {
    content = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const chapters = identifyChapters(content);
  const warnings: string[] = [];
  if (chapters.length === 0) {
    warnings.push('未识别到任何 SRS 章节，将全文作为单分片处理');
  }

  const { shards, shardContents } = shardContent(content, chapters, lang, absSrc);
  const gaps = detectGaps(content, chapters);

  const shardDir = path.join(workDir, '1_shard');
  if (!fs.existsSync(shardDir)) fs.mkdirSync(shardDir, { recursive: true });
  for (const shard of shards) {
    fs.writeFileSync(path.join(shardDir, shard.file), shardContents.get(shard.file) || '', 'utf-8');
  }

  const sourceHash = crypto.createHash('sha256').update(content).digest('hex');
  const index: ShardIndex = {
    version: '1.0',
    source_path: absSrc,
    source_hash: sourceHash,
    language: lang,
    total_chars: content.length,
    total_shards: shards.length,
    shards,
    gaps,
    warnings,
  };

  const ctxDir = path.join(workDir, '_ctx');
  if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(path.join(ctxDir, 'shard_index.json'), JSON.stringify(index, null, 2), 'utf-8');

  fs.writeFileSync(path.join(workDir, 'CONTEXT.md'), generateContext(shards, gaps, content), 'utf-8');

  const gapsContent = `# GAPS — 信息缺口追踪

## 缺口清单

${gaps.map((g, i) =>
  `| GAP-${String(i + 1).padStart(3, '0')} | ${g.priority} | ${g.type} | ${g.description} | ${g.source_chapter} | — | — | 待处理 |`
).join('\n')}
${gaps.length === 0 ? '（无已检测到的缺口）' : ''}
`;
  fs.writeFileSync(path.join(workDir, 'GAPS.md'), gapsContent, 'utf-8');

  return {
    status: 'ok',
    data: { shard_count: shards.length, gap_count: gaps.length, source_hash: sourceHash },
  };
}
