/**
 * build-tla-graph.ts — 从 TLA+ 规约构建系统交互图谱 (S5)
 *
 * CLI: npx tsx index.ts build-tla-graph --workdir .srs_formalizer
 *
 * 读取 5_formal/specs/*.tla → 构建系统交互图谱 JSON + Cypher
 * 前置条件: TLA+ specs must pass SANY+TLC validation first
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { buildTlaGraphFromDir, exportTlaToCypher } from '../lib/tla-graph.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

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

  const specsDir = path.join(workDir, '5_formal', 'specs');
  if (!fs.existsSync(specsDir)) {
    return { status: 'error', message: `Specs directory not found: ${specsDir}` };
  }

  const tlaFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.tla'));
  if (tlaFiles.length === 0) {
    return { status: 'error', message: 'No .tla files found in 5_formal/specs/' };
  }

  // Build graph
  const graph = buildTlaGraphFromDir(specsDir, workDir);

  // Write JSON
  const graphPath = path.join(workDir, '5_formal', 'tla-interaction-graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');

  // Write Cypher
  const cypherOutDir = path.join(workDir, '6_outputs', 'knowledge_graph');
  if (!fs.existsSync(cypherOutDir)) fs.mkdirSync(cypherOutDir, { recursive: true });
  fs.writeFileSync(path.join(cypherOutDir, 'tla-interaction.cypher'), exportTlaToCypher(graph), 'utf-8');

  return {
    status: 'ok',
    data: {
      specs: graph.metadata.spec_count,
      actions: graph.metadata.total_actions,
      invariants: graph.metadata.total_invariants,
      max_depth: graph.metadata.max_hierarchy_depth,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
