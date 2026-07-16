/**
 * build-architecture.ts — 构建架构图命令
 *
 * CLI: npx tsx index.ts build-architecture --workdir .srs_formalizer
 *
 * 读取 2_extract/architecture/ 下的 JSONL 文件（arch-1, arch-2, arch-3），
 * 创建 Module / Actor / Constraint 节点和 CONTAINS / PARENT_OF 边，
 * 合并入现有知识图谱。
 * 输出 3_graph/graph/graph.with_architecture.json。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph } from '../lib/graph.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { loadGraph, readJsonLines, processArch1, processArch2, processArch3, type ArchMetrics, type Arch1Record, type Arch2Record, type Arch3Record } from '../lib/architecture/builder.js';

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

  // Load existing graph or start with an empty one
  let graph = loadGraph(workDir) ?? new Graph();
  const metrics: ArchMetrics = { modules: 0, actors: 0, constraints: 0, contains_edges: 0 };

  const archDir = path.join(workDir, '2_extract', 'architecture');

  // -- arch-1: base architecture definition --
  const arch1Path = path.join(archDir, 'arch-1.jsonl');
  if (fs.existsSync(arch1Path)) {
    const records = readJsonLines(arch1Path) as Arch1Record[];
    processArch1(graph, records, metrics);
  }

  // -- arch-2: incremental operations --
  const arch2Path = path.join(archDir, 'arch-2.jsonl');
  if (fs.existsSync(arch2Path)) {
    const records = readJsonLines(arch2Path) as Arch2Record[];
    const updatedGraph = processArch2(graph, records, metrics);
    graph = updatedGraph;
  }

  // -- arch-3: correction operations --
  const arch3Path = path.join(archDir, 'arch-3.jsonl');
  if (fs.existsSync(arch3Path)) {
    const records = readJsonLines(arch3Path) as Arch3Record[];
    processArch3(graph, records);
  }

  // Write output graph
  const graphDir = path.join(workDir, '3_graph', 'graph');
  if (!fs.existsSync(graphDir)) {
    fs.mkdirSync(graphDir, { recursive: true });
  }
  const outputPath = path.join(graphDir, 'graph.with_architecture.json');
  fs.writeFileSync(outputPath, JSON.stringify(graph.toJSON(), null, 2), 'utf-8');

  return {
    status: 'ok',
    data: {
      modules: metrics.modules,
      actors: metrics.actors,
      constraints: metrics.constraints,
      contains_edges: metrics.contains_edges,
    },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
