/**
 * analyze-structure.ts — 需求知识图谱结构分析命令
 *
 * CLI: npx tsx index.ts analyze-structure --workdir .srs_formalizer
 *
 * 读取 graph/graph.json，调用 traversal.ts 的 findOrphans / findDanglingEdges / findConceptIslands，
 * 输出分析结果到 analysis/ 目录，并生成子代理结构缺口分析提示词。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph, type GraphData } from '../lib/graph.js';
import { findOrphans, findDanglingEdges, findConceptIslands } from '../lib/graph-algorithms.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Write an array of objects as JSONL to the given file path.
 * Each object is serialized as a single JSON line.
 */
function writeJsonlFile(filePath: string, records: unknown[]): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const content = records.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(filePath, content + (records.length > 0 ? '\n' : ''), 'utf-8');
}

// ---------------------------------------------------------------------------
// Structure gap analysis markdown generation
// ---------------------------------------------------------------------------

/**
 * Generate a markdown table of structural defects found in the graph,
 * formatted as required by the SRS §6.1 table template for sub-agent prompts.
 */
function generateGapAnalysisMd(
  orphanIds: string[],
  danglingEdges: { edgeId: string; targetId: string }[],
  islands: string[][],
  graph: Graph
): string {
  const lines: string[] = [];

  lines.push('# 结构缺口分析');
  lines.push('');
  lines.push('| 缺陷ID | 类型 | 节点/边ID | 上下文 | SRS原文引用 |');
  lines.push('|--------|------|-----------|--------|-------------|');

  // --- Orphan rows ---
  let orphanIdx = 0;
  for (const id of orphanIds) {
    orphanIdx++;
    const node = graph.getNode(id);
    const statement = (node?.properties?.statement as string) ?? '';
    const sourceFile = (node?.properties?.source_file as string) ?? '';
    // Truncate long statements for readability
    const truncated = statement.length > 60 ? statement.slice(0, 57) + '...' : statement;
    const defectId = `ORPHAN-${String(orphanIdx).padStart(3, '0')}`;
    lines.push(`| ${defectId} | 孤立需求 | ${id} | ${truncated} | ${sourceFile} |`);
  }

  // --- Dangling edge rows ---
  let dangleIdx = 0;
  for (const de of danglingEdges) {
    dangleIdx++;
    const defectId = `DANGLE-${String(dangleIdx).padStart(3, '0')}`;
    lines.push(`| ${defectId} | 悬挂边 | ${de.edgeId} | 目标节点 ${de.targetId} 不存在 | — |`);
  }

  // --- Island rows (skip size-1 islands already reported as orphans) ---
  const nonTrivialIslands = islands.filter(is => is.length > 1);
  if (nonTrivialIslands.length > 1) {
    let islandIdx = 0;
    for (const island of nonTrivialIslands) {
      islandIdx++;
      const defectId = `ISLAND-${String(islandIdx).padStart(3, '0')}`;
      const nodeList = island.join(', ');
      lines.push(`| ${defectId} | 概念孤岛 | ${nodeList} | ${island.length} 个节点形成独立连通分量 | — |`);
    }
  } else if (nonTrivialIslands.length === 1 && orphanIds.length > 0) {
    // Single non-trivial island + orphans = some structure but many isolates
    // Don't report the main island as a defect, it's the main body
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  // Read 3_graph/graph/graph.json
  const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    return { status: 'error', message: `Graph file not found: ${graphPath}` };
  }

  let graphData: GraphData;
  try {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    graphData = JSON.parse(raw) as GraphData;
  } catch (err) {
    return { status: 'error', message: `Failed to parse graph file: ${(err as Error).message}` };
  }

  const graph = Graph.fromJSON(graphData);

  // Run algorithms
  const orphanIds = findOrphans(graph);
  const danglingEdges = findDanglingEdges(graph);
  const islands = findConceptIslands(graph);

  // Ensure output directories
  const analysisDir = path.join(workDir, '3_graph', 'analysis');
  const promptsDir = path.join(analysisDir, 'subagent_prompts');
  ensureDir(analysisDir);
  ensureDir(promptsDir);

  // === 1. Write orphan_nodes.jsonl ===
  const orphanRecords = orphanIds.map(id => {
    const node = graph.getNode(id);
    return {
      id,
      statement: (node?.properties?.statement as string) ?? '',
      category: (node?.properties?.category as string) ?? '',
      confidence: (node?.properties?.confidence as string) ?? '',
    };
  });
  writeJsonlFile(path.join(analysisDir, 'orphan_nodes.jsonl'), orphanRecords);

  // === 2. Write dangling_edges.jsonl ===
  const danglingRecords = danglingEdges.map(de => ({
    edge_id: de.edgeId,
    target_id: de.targetId,
  }));
  writeJsonlFile(path.join(analysisDir, 'dangling_edges.jsonl'), danglingRecords);

  // === 3. Write concept_islands.jsonl ===
  const islandRecords = islands.map((island, idx) => ({
    island_index: idx,
    size: island.length,
    nodes: island,
  }));
  writeJsonlFile(path.join(analysisDir, 'concept_islands.jsonl'), islandRecords);

  // === 4. Write structure_gap_analysis.md ===
  const mdContent = generateGapAnalysisMd(orphanIds, danglingEdges, islands, graph);
  fs.writeFileSync(path.join(promptsDir, 'structure_gap_analysis.md'), mdContent, 'utf-8');

  return {
    status: 'ok',
    data: {
      orphan_count: orphanIds.length,
      dangling_count: danglingEdges.length,
      island_count: islands.length,
      analysis_dir: analysisDir,
    },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
