/**
 * analyze-graph.ts — SRSIR 语义分析命令 (M2 port with NFR isolation)
 *
 * CLI: npx tsx index.ts analyze-graph --workdir .srs_formalizer
 *
 * 读取 workdir/srs-ir.json，执行 Jaccard 重复检测、反义词冲突检测、
 * 同侧面聚类（含 NFR 隔离），输出到 3_graph/analysis/ 目录。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR } from '../types/srs-ir.js';
import { ensureDir, writeJsonlFile } from '../lib/fs-utils.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { generateDuplicateAnalysisMd, generateConflictAnalysisMd, generateAspectAnalysisMd } from '../lib/prompt-templates.js';
import {
  findDuplicatePairsFromIR,
  findConflictPairsFromIR,
  findSameAspectClustersFromIR,
} from '../lib/graph-algorithms.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return { status: 'error', message: `SRSIR file not found: ${irPath}` };

  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR; }
  catch (err) { return { status: 'error', message: `Failed to parse srs-ir.json: ${(err as Error).message}` }; }

  const analysisDir = path.join(workDir, '3_graph', 'analysis');
  const promptsDir = path.join(analysisDir, 'subagent_prompts');
  ensureDir(analysisDir);
  ensureDir(promptsDir);

  const duplicatePairs = findDuplicatePairsFromIR(ir);
  writeJsonlFile(path.join(analysisDir, 'suspected_duplicates.jsonl'), duplicatePairs);

  const conflictPairs = findConflictPairsFromIR(ir);
  writeJsonlFile(path.join(analysisDir, 'suspected_conflicts.jsonl'), conflictPairs);

  const allNodeIds = ir.nodes.filter(n => n.type === 'requirement' || n.type === 'nfr').map(n => n.id);
  const aspectClusters = findSameAspectClustersFromIR(ir, allNodeIds);
  const aspectRecords = aspectClusters.map(c => ({
    clusterId: c.clusterId, object: c.object, nodes: c.nodes,
    statements: c.statements, nfrNodes: c.nfrNodes,
    hasNFR: c.nfrNodes.length > 0,
  }));
  writeJsonlFile(path.join(analysisDir, 'same_aspect_clusters.jsonl'), aspectRecords);

  fs.writeFileSync(path.join(promptsDir, 'duplicate_analysis.md'), generateDuplicateAnalysisMd(duplicatePairs), 'utf-8');
  fs.writeFileSync(path.join(promptsDir, 'conflict_analysis.md'), generateConflictAnalysisMd(conflictPairs), 'utf-8');
  fs.writeFileSync(path.join(promptsDir, 'aspect_analysis.md'), generateAspectAnalysisMd(aspectRecords), 'utf-8');

  return { status: 'ok', data: { duplicate_pairs: duplicatePairs.length, conflict_pairs: conflictPairs.length, aspect_clusters: aspectRecords.length, analysis_dir: analysisDir } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
