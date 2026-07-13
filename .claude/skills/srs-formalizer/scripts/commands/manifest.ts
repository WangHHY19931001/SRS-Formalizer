/**
 * manifest.ts — SRS 分片 + 章节识别 + 信息缺口检测 + 交叉引用 + NFR 扫描
 *
 * CLI: npx tsx index.ts manifest --src <path> --lang zh|en --workdir .srs_formalizer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { identifyChapters, detectCrossRefs, scanNFR } from '../lib/frontend/parser.js';
import { buildShardIndex } from '../lib/frontend/sharder.js';
import type { ShardIndex, ShardEntry, GapEntry } from '../lib/frontend/sharder.js';
import type { CrossRef, NFRProfile, NFRCategory } from '../types/srs-ir.js';

function collectSourceFiles(absSrc: string): string[] {
  const stat = fs.statSync(absSrc);
  if (!stat.isDirectory()) return [absSrc];
  const files = fs.readdirSync(absSrc).filter(f => /\.(md|html|htm)$/i.test(f)).sort().map(f => path.join(absSrc, f));
  return files.length === 0 ? [absSrc] : files;
}

function mergeNFRProfiles(profiles: NFRProfile[]): NFRProfile {
  const catMap = new Map<string, { keywordHits: number; shardIds: string[]; nodeIds: string[] }>();
  const allShards: NFRProfile['weightedShards'] = [];
  for (const p of profiles) {
    for (const dc of p.detectedCategories) {
      const existing = catMap.get(dc.category);
      if (existing) {
        existing.keywordHits += dc.keywordHits;
        for (const sid of dc.shardIds) { if (!existing.shardIds.includes(sid)) existing.shardIds.push(sid); }
        for (const nid of dc.nodeIds) { if (!existing.nodeIds.includes(nid)) existing.nodeIds.push(nid); }
      } else {
        catMap.set(dc.category, { keywordHits: dc.keywordHits, shardIds: [...dc.shardIds], nodeIds: [...dc.nodeIds] });
      }
    }
    allShards.push(...p.weightedShards);
  }
  const detectedCategories = Array.from(catMap.entries()).map(([category, v]) => ({
    category: category as NFRCategory,
    keywordHits: v.keywordHits,
    shardIds: v.shardIds,
    nodeIds: v.nodeIds,
  }));
  const allCatRef: readonly NFRCategory[] = ['performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance'];
  const overallCoverage = detectedCategories.length / allCatRef.length;
  const blindSpots = allCatRef.filter(c => !catMap.has(c));
  return { detectedCategories, weightedShards: allShards, overallCoverage, blindSpots };
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
  const allCrossRefs: CrossRef[] = [];
  const allGaps: GapEntry[] = [];
  const allWarnings: string[] = [];
  const nfrProfiles: NFRProfile[] = [];
  let totalChars = 0;

  for (const sourcePath of sourceFiles) {
    let content: string;
    try { content = fs.readFileSync(sourcePath, 'utf-8'); }
    catch (err) { return { status: 'error', message: `Failed to read ${sourcePath}: ${(err as Error).message}` }; }

    if (content.trim().length === 0) { allWarnings.push(`Skipping empty file: ${sourcePath}`); continue; }

    const chapters = identifyChapters(content, sourcePath);
    if (chapters.length === 0) allWarnings.push(`No chapters detected in ${sourcePath} — treating as flat document`);

    const crossRefs = detectCrossRefs(content, chapters);
    const nfrProfile = scanNFR(content, lang as 'zh' | 'en');

    const index = buildShardIndex(sourcePath, content, chapters, lang as 'zh' | 'en', nfrProfile);

    allShards.push(...index.shards);
    allCrossRefs.push(...crossRefs);
    for (const gap of index.gaps) {
      if (!allGaps.some(g => g.description === gap.description)) allGaps.push(gap);
    }
    allWarnings.push(...index.warnings);
    nfrProfiles.push(nfrProfile);
    totalChars += content.length;
  }

  const mergedNFR = mergeNFRProfiles(nfrProfiles);
  const sourceHash = crypto.createHash('sha256').update(absSrc).digest('hex').slice(0, 16);

  const shardIndex: ShardIndex = {
    version: '1.1',
    source_path: absSrc,
    source_hash: sourceHash,
    language: lang as 'zh' | 'en',
    total_chars: totalChars,
    total_shards: allShards.length,
    shards: allShards,
    gaps: allGaps,
    warnings: allWarnings,
    cross_references: allCrossRefs,
    nfr_profile: mergedNFR,
  };

  const outputDir = path.join(workDir, '1_input');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'shard_index.json'), JSON.stringify(shardIndex, null, 2), 'utf-8');

  return { status: 'ok', data: { total_files: sourceFiles.length, total_shards: allShards.length, total_gaps: allGaps.length, index_path: path.join(outputDir, 'shard_index.json') } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
