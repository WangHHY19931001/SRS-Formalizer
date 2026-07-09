/**
 * query-graph.ts — 需求知识图谱查询与遍历命令
 *
 * CLI: npx tsx index.ts query-graph --workdir .srs_formalizer --query <type> [--params '{}']
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { loadGraph, findShortestPath, getContext, nodeDetail, getNodeModule, listModules } from '../lib/graph-algorithms.js';

type G = ReturnType<typeof loadGraph>;
type P = Record<string, unknown>;

const VALID_QUERIES = new Set(['node', 'neighbors', 'module', 'modules', 'path', 'context', 'brainstorm']);

function handleGetNode(p: P, g: G) {
  const nodeId = String(p.id ?? ''); if (!nodeId) return { error: 'Missing id parameter' };
  const node = g.getNode(nodeId); if (!node) return { error: `Node not found: ${nodeId}` };
  return { node: nodeDetail(node), module: getNodeModule(node) };
}

function handleGetNeighbors(p: P, g: G) {
  const nodeId = String(p.id ?? ''); if (!nodeId) return { error: 'Missing id parameter' };
  const node = g.getNode(nodeId); if (!node) return { error: `Node not found: ${nodeId}` };
  const forward = g.getNeighbors(nodeId).map(id => { const n = g.getNode(id); return n ? nodeDetail(n) : { id }; });
  const backward = g.getIncoming(nodeId).map(id => { const n = g.getNode(id); return n ? nodeDetail(n) : { id }; });
  return { node: nodeDetail(node), forward, backward, module: getNodeModule(node) };
}

function handleGetModule(p: P, g: G) {
  const moduleName = String(p.name ?? ''); if (!moduleName) return { error: 'Missing name parameter' };
  const nodes = g.getAllNodes().filter(n => getNodeModule(n) === moduleName).map(nodeDetail);
  return { module: moduleName, node_count: nodes.length, nodes };
}

function handleListModules(_p: P, g: G) { return { modules: listModules(g) }; }

function handleFindPath(p: P, g: G) {
  const fromId = String(p.from ?? ''); const toId = String(p.to ?? '');
  if (!fromId || !toId) return { error: 'Missing from/to parameter' };
  const path = findShortestPath(g, fromId, toId);
  return { from: fromId, to: toId, reachable: path !== null, path };
}

function handleGetContext(p: P, g: G) {
  const nodeId = String(p.id ?? ''); if (!nodeId) return { error: 'Missing id parameter' };
  return { center: nodeId, context: getContext(g, nodeId) };
}

function handleExportBrainstorm(_p: P, g: G, wd: string) {
  const outputDir = path.join(wd, '6_outputs', 'brainstorming');
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, 'brainstorm_context.json');
  fs.writeFileSync(filePath, JSON.stringify(g.toJSON(), null, 2), 'utf-8');
  return { exported: filePath, node_count: g.getAllNodes().length, edge_count: g.getAllEdges().length };
}

type Handler = (p: P, g: G, wd: string) => Record<string, unknown>;
const HANDLERS: Record<string, Handler> = {
  node: (p, g) => handleGetNode(p, g),
  neighbors: (p, g) => handleGetNeighbors(p, g),
  module: (p, g) => handleGetModule(p, g),
  modules: (p, g) => handleListModules(p, g),
  path: (p, g) => handleFindPath(p, g),
  context: (p, g) => handleGetContext(p, g),
  brainstorm: (p, g, wd) => handleExportBrainstorm(p, g, wd),
};

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null; let query: string | null; let paramsStr: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); query = safeParseArg(args, '--query'); paramsStr = safeParseArg(args, '--params'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  if (!query) return { status: 'error', message: 'Missing required argument: --query' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!VALID_QUERIES.has(query.toLowerCase())) return { status: 'error', message: `Invalid query: "${query}". Valid: ${[...VALID_QUERIES].join(', ')}` };

  let graph: G;
  try { graph = loadGraph(workDir, '3_graph/graph'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  let params: P = {};
  if (paramsStr) { try { params = JSON.parse(paramsStr) as P; } catch { return { status: 'error', message: 'Invalid JSON in --params' }; } }

  try { return { status: 'ok', data: HANDLERS[query.toLowerCase()]!(params, graph, workDir) }; }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
