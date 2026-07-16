/**
 * analyze-structure.ts — SRSIR 结构分析命令 (M1 port)
 *
 * CLI: npx tsx index.ts analyze-structure --workdir .srs_formalizer
 *
 * 读取 workdir/srs-ir.json，调用 graph-algorithms.ts 的 SRSIR 结构分析函数，
 * 输出分析结果到 3_graph/analysis/ 目录。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR } from '../types/srs-ir.js';
import { ensureDir, writeJsonlFile } from '../lib/fs-utils.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import {
  findOrphansFromIR,
  findDanglingEdgesFromIR,
  findConceptIslandsFromIR,
  findCrossFileIslands,
} from '../lib/graph-algorithms.js';

function generateGapAnalysisMd(
  orphanIds: string[],
  danglingEdges: { edgeId: string; targetId: string }[],
  islands: string[][],
  ir: SRSIR,
): string {
  const nodeMap = new Map(ir.nodes.map(n => [n.id, n]));
  const lines: string[] = [];
  lines.push('# 结构缺口分析', '',
    '| 缺陷ID | 类型 | 节点/边ID | 上下文 | SRS原文引用 |',
    '|--------|------|-----------|--------|-------------|');

  let orphanIdx = 0;
  for (const id of orphanIds) {
    orphanIdx++;
    const node = nodeMap.get(id);
    const stmt = (node?.properties.statement ?? '').slice(0, 57) + (node?.properties.statement && node.properties.statement.length > 60 ? '...' : '');
    const src = node?.source.filePath ?? '';
    lines.push(`| ORPHAN-${String(orphanIdx).padStart(3, '0')} | 孤立需求 | ${id} | ${stmt} | ${src} |`);
  }

  let dangleIdx = 0;
  for (const de of danglingEdges) {
    dangleIdx++;
    lines.push(`| DANGLE-${String(dangleIdx).padStart(3, '0')} | 悬挂边 | ${de.edgeId} | 目标节点 ${de.targetId} 不存在 | — |`);
  }

  const nonTrivial = islands.filter(is => is.length > 1);
  if (nonTrivial.length > 1) {
    for (let i = 0; i < nonTrivial.length; i++) {
      lines.push(`| ISLAND-${String(i + 1).padStart(3, '0')} | 概念孤岛 | ${nonTrivial[i]!.join(', ')} | ${nonTrivial[i]!.length} 个节点形成独立连通分量 | — |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

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

  const orphanIds = findOrphansFromIR(ir);
  const danglingEdges = findDanglingEdgesFromIR(ir);
  const islands = findConceptIslandsFromIR(ir);
  const crossFile = findCrossFileIslands(ir);

  const analysisDir = path.join(workDir, '3_graph', 'analysis');
  const promptsDir = path.join(analysisDir, 'subagent_prompts');
  ensureDir(analysisDir);
  ensureDir(promptsDir);

  const nodeMap = new Map(ir.nodes.map(n => [n.id, n]));
  writeJsonlFile(path.join(analysisDir, 'orphan_nodes.jsonl'), orphanIds.map(id => {
    const node = nodeMap.get(id);
    return { id, statement: node?.properties.statement ?? '', category: node?.properties.category ?? '', confidence: node?.properties.confidence ?? '' };
  }));

  writeJsonlFile(path.join(analysisDir, 'dangling_edges.jsonl'), danglingEdges.map(de => ({ edge_id: de.edgeId, target_id: de.targetId })));

  writeJsonlFile(path.join(analysisDir, 'concept_islands.jsonl'), islands.map((is, idx) => ({ island_index: idx, size: is.length, nodes: is })));

  writeJsonlFile(path.join(analysisDir, 'cross_file_islands.jsonl'), [{ island_count: crossFile.islandCount, orphan_shards: crossFile.orphanShards, bridges: crossFile.bridges }]);

  const md = generateGapAnalysisMd(orphanIds, danglingEdges, islands, ir);
  fs.writeFileSync(path.join(promptsDir, 'structure_gap_analysis.md'), md, 'utf-8');

  return { status: 'ok', data: { orphan_count: orphanIds.length, dangling_count: danglingEdges.length, island_count: islands.length, cross_file_islands: crossFile.islandCount, analysis_dir: analysisDir } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
