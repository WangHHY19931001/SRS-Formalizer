/**
 * build-behavior-graph.ts — 从 BDD .feature 文件构建系统行为图谱 (S4)
 *
 * CLI: npx tsx index.ts build-behavior-graph --workdir .srs_formalizer
 *
 * 读取 4_bdd/features/*.feature → 构建行为图谱 JSON
 * 输出: 4_bdd/behavior-graph.json + 6_outputs/knowledge_graph/behavior.cypher
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { buildBehaviorGraphFromDir, exportBehaviorToCypher } from '../lib/behavior-graph.js';
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

  const featuresDir = path.join(workDir, '4_bdd', 'features');
  if (!fs.existsSync(featuresDir)) {
    return { status: 'error', message: `Features directory not found: ${featuresDir}` };
  }

  const featureFiles = fs.readdirSync(featuresDir).filter(f => f.endsWith('.feature'));
  if (featureFiles.length === 0) {
    return { status: 'error', message: 'No .feature files found in 4_bdd/features/' };
  }

  // Check for unresolved placeholders
  let hasPlaceholders = false;
  for (const f of featureFiles) {
    const content = fs.readFileSync(path.join(featuresDir, f), 'utf-8');
    if (content.includes('<THEN_PLACEHOLDER>')) {
      hasPlaceholders = true;
      break;
    }
  }
  if (hasPlaceholders) {
    return { status: 'error', message: 'Unresolved <THEN_PLACEHOLDER> found — run validate-bdd and fix before building behavior graph' };
  }

  // Build graph
  const graph = buildBehaviorGraphFromDir(featuresDir, workDir);

  // Write JSON
  const graphPath = path.join(workDir, '4_bdd', 'behavior-graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');

  // Write Cypher
  const cypherOutDir = path.join(workDir, '6_outputs', 'knowledge_graph');
  if (!fs.existsSync(cypherOutDir)) fs.mkdirSync(cypherOutDir, { recursive: true });
  fs.writeFileSync(path.join(cypherOutDir, 'behavior.cypher'), exportBehaviorToCypher(graph), 'utf-8');

  return {
    status: 'ok',
    data: {
      features: graph.metadata.feature_count,
      scenarios: graph.metadata.scenario_count,
      actions: graph.metadata.action_count,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      graph_path: graphPath,
    },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
