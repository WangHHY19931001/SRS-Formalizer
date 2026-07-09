/**
 * analyze-graph.ts — 需求知识图谱语义分析命令（SRS §5.8）
 *
 * CLI: npx tsx index.ts analyze-graph --workdir .srs_formalizer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph, type GraphData } from '../lib/graph.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ensureDir, writeJsonlFile } from '../lib/fs-utils.js';
import { tokenize, jaccardSimilarity, hasNegation, isAntonymPair, findSameAspectClusters } from '../lib/text-analysis.js';
import { generateDuplicateAnalysisMd, generateConflictAnalysisMd, generateAspectAnalysisMd } from '../lib/prompt-templates.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const fixedGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
  const fallbackGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  let graphPath: string;
  if (fs.existsSync(fixedGraphPath)) graphPath = fixedGraphPath;
  else if (fs.existsSync(fallbackGraphPath)) graphPath = fallbackGraphPath;
  else return { status: 'error', message: `Graph file not found: tried ${fixedGraphPath} and ${fallbackGraphPath}` };

  let graphData: GraphData;
  try { graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as GraphData; }
  catch (err) { return { status: 'error', message: `Failed to parse graph file: ${(err as Error).message}` }; }

  const graph = Graph.fromJSON(graphData);
  const reqNodes = graph.getAllNodes().filter(n => n.labels.includes(':Requirement'));
  const reqIds = reqNodes.map(n => n.id);
  const reqStatements = new Map<string, string>();
  for (const n of reqNodes) reqStatements.set(n.id, (n.properties.statement as string) ?? '');

  const analysisDir = path.join(workDir, '3_graph', 'analysis');
  const promptsDir = path.join(analysisDir, 'subagent_prompts');
  ensureDir(analysisDir);
  ensureDir(promptsDir);

  // Token cache
  const tokenCache = new Map<string, Set<string>>();
  for (const id of reqIds) tokenCache.set(id, tokenize(reqStatements.get(id) ?? ''));

  // 1. Jaccard duplicate detection
  const duplicatePairs: { pairId: string; nodeA: string; nodeB: string; similarity: number; statementA: string; statementB: string }[] = [];
  let dupIdx = 0;
  for (let i = 0; i < reqIds.length; i++) {
    for (let j = i + 1; j < reqIds.length; j++) {
      const sim = jaccardSimilarity(tokenCache.get(reqIds[i]!)!, tokenCache.get(reqIds[j]!)!);
      if (sim > 0.7) {
        dupIdx++;
        duplicatePairs.push({ pairId: `DUP-${String(dupIdx).padStart(3, '0')}`, nodeA: reqIds[i]!, nodeB: reqIds[j]!, similarity: Math.round(sim * 1000) / 1000, statementA: reqStatements.get(reqIds[i]!) ?? '', statementB: reqStatements.get(reqIds[j]!) ?? '' });
      }
    }
  }
  writeJsonlFile(path.join(analysisDir, 'suspected_duplicates.jsonl'), duplicatePairs);

  // 2. Antonym conflict detection
  const conflictPairs: { pairId: string; nodeA: string; nodeB: string; similarity: number; statementA: string; statementB: string; negationInA: boolean; negationInB: boolean }[] = [];
  let conIdx = 0;
  for (let i = 0; i < reqIds.length; i++) {
    for (let j = i + 1; j < reqIds.length; j++) {
      const stmtA = reqStatements.get(reqIds[i]!) ?? '', stmtB = reqStatements.get(reqIds[j]!) ?? '';
      if (isAntonymPair(stmtA, stmtB)) {
        conIdx++;
        const sim = jaccardSimilarity(tokenCache.get(reqIds[i]!)!, tokenCache.get(reqIds[j]!)!);
        conflictPairs.push({ pairId: `CON-${String(conIdx).padStart(3, '0')}`, nodeA: reqIds[i]!, nodeB: reqIds[j]!, similarity: Math.round(sim * 1000) / 1000, statementA: stmtA, statementB: stmtB, negationInA: hasNegation(stmtA), negationInB: hasNegation(stmtB) });
      }
    }
  }
  writeJsonlFile(path.join(analysisDir, 'suspected_conflicts.jsonl'), conflictPairs);

  // 3. Same-aspect clusters
  const aspectClusters = findSameAspectClusters(graph, reqIds);
  const aspectRecords = aspectClusters.map((c, idx) => ({ clusterId: `ASP-${String(idx + 1).padStart(3, '0')}`, object: c.object, nodes: c.nodes, statements: c.statements }));
  writeJsonlFile(path.join(analysisDir, 'same_aspect_clusters.jsonl'), aspectRecords);

  // 4. Sub-agent prompts
  fs.writeFileSync(path.join(promptsDir, 'duplicate_analysis.md'), generateDuplicateAnalysisMd(duplicatePairs), 'utf-8');
  fs.writeFileSync(path.join(promptsDir, 'conflict_analysis.md'), generateConflictAnalysisMd(conflictPairs), 'utf-8');
  fs.writeFileSync(path.join(promptsDir, 'aspect_analysis.md'), generateAspectAnalysisMd(aspectRecords), 'utf-8');

  return { status: 'ok', data: { duplicate_pairs: duplicatePairs.length, conflict_pairs: conflictPairs.length, aspect_clusters: aspectRecords.length, analysis_dir: analysisDir } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
