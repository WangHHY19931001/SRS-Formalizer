/**
 * manifest.ts — SRS 分片 + 章节识别 + 信息缺口检测
 *
 * CLI: npx tsx index.ts manifest --src <path> --lang zh|en --workdir .srs_formalizer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult, ShardEntry, GapEntry } from '../types/index.js';
import type { ShardIndex } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { identifyChapters, type ChapterInfo } from '../lib/chapter-parser.js';
import { buildShardIndex } from '../lib/sharder.js';

function collectSourceFiles(absSrc: string): string[] {
  const stat = fs.statSync(absSrc);
  if (!stat.isDirectory()) return [absSrc];
  const files = fs.readdirSync(absSrc).filter(f => /\.(md|html|htm)$/i.test(f)).sort().map(f => path.join(absSrc, f));
  return files.length === 0 ? [absSrc] : files;
}

function detectGaps(content: string, chapters: ChapterInfo[]): GapEntry[] {
  const gaps: GapEntry[] = [];
  const unresolvedChapter = chapters.find(ch => ch.title === '尚未解决问题');
  if (unresolvedChapter) {
    const lines = content.split('\n');
    const startLine = unresolvedChapter.line + 1;
    let endLine = lines.length;
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i]!.match(new RegExp(`^#{1,${unresolvedChapter.level}}\\s`))) { endLine = i; break; }
    }
    const sectionContent = lines.slice(startLine, endLine).join('\n').trim();
    if (sectionContent && sectionContent !== '（无）' && sectionContent !== '(none)') {
      for (const issue of sectionContent.split('\n').filter(l => l.match(/^\d+\.\s/))) {
        gaps.push({ priority: 'P0', type: 'unsolved_issue', description: issue.replace(/^\d+\.\s*/, '').trim(), source_chapter: '§7' });
      }
    }
  }
  if (!chapters.find(ch => ch.title === '术语表')) {
    gaps.push({ priority: 'P1', type: 'undefined_term', description: 'SRS 未包含术语表章节', source_chapter: '§1.4' });
  }
  return gaps;
}

function generateContext(shards: ShardEntry[], gaps: GapEntry[], content: string): string {
  const termMatch = content.match(/\|([^|]+)\|([^|]+)\|/g);
  const termSection = termMatch
    ? termMatch.slice(0, 20).map(m => { const parts = m.split('|').map(s => s.trim()).filter(Boolean); return `| ${parts[0] || '?'} | ${parts[1] || '?'} | — |`; }).join('\n')
    : '| — | — | — |';

  return `# CONTEXT — SRS 术语表与切片索引\n\n## 术语表\n\n| 术语 | 定义 | 来源章节 |\n|------|------|----------|\n${termSection}\n\n## 模块切片索引\n\n| 模块 | 分片文件 | Token 估算 |\n|------|---------|-----------|\n${shards.map(s => `| ${s.module} | ${s.file} | ${s.estimated_tokens} |`).join('\n')}\n\n## 信息缺口\n\n${gaps.length > 0 ? gaps.map(g => `- [${g.priority}] ${g.description}（${g.source_chapter}）`).join('\n') : '（无已检测到的缺口）'}\n`;
}

export async function main(args: string[]): Promise<CliResult> {
  let srcPath: string | null; let lang: string; let workDirArg: string | null;
  try { srcPath = safeParseArg(args, '--src'); lang = safeParseArg(args, '--lang') || 'zh'; workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!srcPath) return { status: 'error', message: 'Missing required argument: --src' };
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  if (lang !== 'zh' && lang !== 'en') return { status: 'error', message: `Invalid --lang: "${lang}". Must be "zh" or "en".` };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const absSrc = path.resolve(srcPath);
  if (!fs.existsSync(absSrc)) return { status: 'error', message: `Source file not found: ${absSrc}` };

  const sourceFiles = collectSourceFiles(absSrc);
  const allShards: ShardEntry[] = [];
  const warnings: string[] = [];
  let totalGaps: GapEntry[] = [];

  for (const sourcePath of sourceFiles) {
    let content: string;
    try { content = fs.readFileSync(sourcePath, 'utf-8'); }
    catch (err) { return { status: 'error', message: `Failed to read ${sourcePath}: ${(err as Error).message}` }; }

    if (content.trim().length === 0) { warnings.push(`Skipping empty file: ${sourcePath}`); continue; }

    const chapters = identifyChapters(content, sourcePath);
    if (chapters.length === 0) warnings.push(`No chapters detected in ${sourcePath} — treating as flat document`);

    const drafts = buildShardIndex(sourcePath, content, chapters, lang as 'zh' | 'en');
    const shards: ShardEntry[] = drafts.map((d, i) => {
      const hash = crypto.createHash('sha256').update(d.locator).digest('hex').slice(0, 12);
      const shortName = path.basename(sourcePath, path.extname(sourcePath));
      return { ...d, id: `${shortName}-${i + 1}-${hash}`, file: `shard-${i + 1}.jsonl` };
    });

    allShards.push(...shards);
    totalGaps.push(...detectGaps(content, chapters));

    const context = generateContext(shards, totalGaps, content);
    const contextDir = path.join(workDir, '1_input', 'context');
    fs.mkdirSync(contextDir, { recursive: true });
    const contextName = path.basename(sourcePath, path.extname(sourcePath)) + '_CONTEXT.md';
    fs.writeFileSync(path.join(contextDir, contextName), context, 'utf-8');
  }

  const shardIndex: ShardIndex = {
    version: '1.0', source_path: absSrc, source_hash: crypto.createHash('sha256').update(absSrc).digest('hex').slice(0, 16),
    language: lang as 'zh' | 'en', total_chars: 0, total_shards: allShards.length,
    shards: allShards, gaps: totalGaps, warnings,
  };

  const outputDir = path.join(workDir, '1_input');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'shard_index.json'), JSON.stringify(shardIndex, null, 2), 'utf-8');

  return { status: 'ok', data: { total_files: sourceFiles.length, total_shards: allShards.length, total_gaps: totalGaps.length, index_path: path.join(outputDir, 'shard_index.json') } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
