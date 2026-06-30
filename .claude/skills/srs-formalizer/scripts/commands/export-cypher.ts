/**
 * export-cypher.ts -- 导出 Cypher 脚本命令 (SRS §5.10)
 *
 * CLI: npx tsx index.ts export-cypher --workdir .srs_formalizer
 *
 * 读取 graph/graph.merged.json（如不存在则 graph.structure_fixed.json，
 * 再不存则 graph/graph.json），调用 lib/cypher.js 的 generateFullScript
 * 生成完整 Cypher 脚本，输出到 outputs/knowledge_graph/schema.cypher。
 *
 * 确定性：相同图谱生成相同 Cypher 脚本。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph, type GraphData } from '../lib/graph.js';
import { generateFullScript } from '../lib/cypher.js';
import { validateWorkDir } from '../lib/security.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

/** Graph files to try, in priority order. */
const GRAPH_PATHS = [
  '3_graph/graph/graph.merged.json',
  '3_graph/graph/graph.structure_fixed.json',
  '3_graph/graph/graph.json',
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const workDirArg = parseArg(args, '--workdir');

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  // Find the first existing graph file in priority order
  let graphPath: string | null = null;
  for (const relPath of GRAPH_PATHS) {
    const candidate = path.join(workDir, relPath);
    if (fs.existsSync(candidate)) {
      graphPath = candidate;
      break;
    }
  }

  if (!graphPath) {
    const tried = GRAPH_PATHS.map(p => path.join(workDir, p)).join(', ');
    return { status: 'error', message: `Graph file not found: tried ${tried}` };
  }

  // Load and parse graph
  let graphData: GraphData;
  try {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    graphData = JSON.parse(raw) as GraphData;
  } catch (err) {
    return { status: 'error', message: `Failed to parse graph file: ${(err as Error).message}` };
  }

  const graph = Graph.fromJSON(graphData);
  const cypherScript = generateFullScript(graph);

  // Ensure output directory and write schema.cypher
  const outputDir = path.join(workDir, '6_outputs', 'knowledge_graph');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'schema.cypher');
  fs.writeFileSync(outputPath, cypherScript, 'utf-8');

  return {
    status: 'ok',
    data: {
      node_count: graph.nodeCount,
      edge_count: graph.edgeCount,
      output_path: outputPath,
    },
  };
}
