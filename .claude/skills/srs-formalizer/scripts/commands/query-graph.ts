/**
 * query-graph.ts -- 图查询与遍历接口 (SRS §5.14)
 *
 * CLI: npx tsx index.ts query-graph --workdir .srs_formalizer --query <type> --params '<json>'
 *
 * 7 种查询类型：
 *   get-node          params: {"id":"..."}          → 节点详情
 *   get-neighbors     params: {"id":"..."}          → 邻接节点列表
 *   get-module        params: {"module":"..."}      → 该模块下所有节点
 *   list-modules      --params 可省略                → 所有模块名
 *   find-path         params: {"from":"...","to":"..."} → BFS 最短路径
 *   get-context       params: {"id":"..."}          → 2 跳邻域
 *   export-brainstorm --params 可省略                → 输出全量数据
 *
 * 确定性：相同查询参数 → 相同输出。
 * 性能：单次查询 ≤5s，路径 BFS O(V+E)。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph, type GraphData, type GraphNode, type GraphEdge } from '../lib/graph.js';
import { validateWorkDir } from '../lib/security.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QueryType =
  | 'get-node'
  | 'get-neighbors'
  | 'get-module'
  | 'list-modules'
  | 'find-path'
  | 'get-context'
  | 'export-brainstorm';

const VALID_QUERIES: QueryType[] = [
  'get-node',
  'get-neighbors',
  'get-module',
  'list-modules',
  'find-path',
  'get-context',
  'export-brainstorm',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

/**
 * Load the graph from the workdir, trying files in priority order:
 * graph.merged.json > graph.structure_fixed.json > graph.json
 */
function loadGraph(workDir: string): Graph {
  const candidates = [
    'graph.merged.json',
    'graph.structure_fixed.json',
    'graph.json',
  ];

  let graphFile: string | null = null;
  for (const name of candidates) {
    const filePath = path.join(workDir, 'graph', name);
    if (fs.existsSync(filePath)) {
      graphFile = filePath;
      break;
    }
  }

  if (!graphFile) {
    throw new Error(
      'No graph file found. Tried: ' +
        candidates.map(f => `graph/${f}`).join(', ')
    );
  }

  const raw = fs.readFileSync(graphFile, 'utf-8');
  const graphData = JSON.parse(raw) as GraphData;
  return Graph.fromJSON(graphData);
}

/** Get the module name from a node's properties, defaulting to 'Unknown'. */
function getNodeModule(node: GraphNode): string {
  const mod = node.properties['module'];
  if (typeof mod === 'string' && mod.length > 0) return mod;
  return 'Unknown';
}

/** Build a detail object for a node (used by get-node and get-neighbors). */
function nodeDetail(node: GraphNode): Record<string, unknown> {
  return {
    id: node.id,
    labels: node.labels,
    properties: { ...node.properties },
  };
}

/** Compute the list of unique module names across all nodes (sorted). */
function listModules(graph: Graph): string[] {
  const moduleSet = new Set<string>();
  for (const node of graph.getAllNodes()) {
    moduleSet.add(getNodeModule(node));
  }
  return [...moduleSet].sort();
}

/**
 * BFS shortest path from `fromId` to `toId`.
 * Returns array of node ids forming the path, or null if unreachable.
 */
function findShortestPath(graph: Graph, fromId: string, toId: string): string[] | null {
  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) {
    return null;
  }

  if (fromId === toId) {
    return [fromId];
  }

  const visited = new Set<string>([fromId]);
  const queue: string[][] = [[fromId]];

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const current = currentPath[currentPath.length - 1]!;
    const neighbors = graph.getNeighbors(current);

    for (const neighbor of neighbors) {
      if (neighbor === toId) {
        return [...currentPath, neighbor];
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...currentPath, neighbor]);
      }
    }

    // Also traverse reverse edges (undirected traversal)
    const incoming = graph.getIncoming(current);
    for (const neighbor of incoming) {
      if (neighbor === toId) {
        return [...currentPath, neighbor];
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...currentPath, neighbor]);
      }
    }
  }

  return null;
}

/**
 * Get the 2-hop neighborhood of a node.
 * Returns a sub-graph with nodes within 2 edges of `id`, plus all edges among them.
 */
function getContext(graph: Graph, id: string): GraphData {
  if (!graph.hasNode(id)) {
    return { nodes: [], edges: [] };
  }

  // 1-hop neighbors (forward + reverse)
  const oneHopIds = new Set<string>([id]);
  const forwardNeighbors = graph.getNeighbors(id);
  const backwardNeighbors = graph.getIncoming(id);
  for (const nid of forwardNeighbors) oneHopIds.add(nid);
  for (const nid of backwardNeighbors) oneHopIds.add(nid);

  // 2-hop: for each 1-hop neighbor, get their neighbors
  const twoHopIds = new Set<string>(oneHopIds);
  for (const nid of oneHopIds) {
    if (nid === id) continue; // skip center to avoid re-adding
    for (const nnid of graph.getNeighbors(nid)) twoHopIds.add(nnid);
    for (const nnid of graph.getIncoming(nid)) twoHopIds.add(nnid);
  }

  // Collect nodes
  const contextNodes: GraphNode[] = [];
  for (const nid of twoHopIds) {
    const node = graph.getNode(nid);
    if (node) contextNodes.push(node);
  }

  // Collect edges where both endpoints are in the context
  const contextNodeIds = new Set(twoHopIds);
  const contextEdges: GraphEdge[] = [];
  for (const edge of graph.getAllEdges()) {
    if (contextNodeIds.has(edge.source) && contextNodeIds.has(edge.target)) {
      contextEdges.push(edge);
    }
  }

  return { nodes: contextNodes, edges: contextEdges };
}

/**
 * Export the full graph to outputs/brainstorming/brainstorm_context.json.
 */
function exportBrainstorm(graph: Graph, workDir: string): string {
  const outputDir = path.join(workDir, 'outputs', 'brainstorming');
  fs.mkdirSync(outputDir, { recursive: true });

  const data = graph.toJSON();
  const outputPath = path.join(outputDir, 'brainstorm_context.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');

  return outputPath;
}

// ---------------------------------------------------------------------------
// Query Handlers
// ---------------------------------------------------------------------------

function handleGetNode(graph: Graph, params: Record<string, unknown>): Record<string, unknown> {
  const id = params['id'];
  if (typeof id !== 'string') {
    throw new Error('Missing or invalid param: "id" must be a string');
  }
  const node = graph.getNode(id);
  if (!node) {
    return { found: false, id };
  }
  return { found: true, node: nodeDetail(node) };
}

function handleGetNeighbors(graph: Graph, params: Record<string, unknown>): Record<string, unknown> {
  const id = params['id'];
  if (typeof id !== 'string') {
    throw new Error('Missing or invalid param: "id" must be a string');
  }
  if (!graph.hasNode(id)) {
    return { id, neighbors: [] };
  }

  const forwardIds = graph.getNeighbors(id);
  const backwardIds = graph.getIncoming(id);

  const forwardNodes = forwardIds
    .map(nid => graph.getNode(nid))
    .filter((n): n is GraphNode => n !== undefined)
    .map(n => nodeDetail(n));

  const backwardNodes = backwardIds
    .map(nid => graph.getNode(nid))
    .filter((n): n is GraphNode => n !== undefined)
    .map(n => nodeDetail(n));

  return {
    id,
    forward: forwardNodes,
    backward: backwardNodes,
  };
}

function handleGetModule(graph: Graph, params: Record<string, unknown>): Record<string, unknown> {
  const moduleName = params['module'];
  if (typeof moduleName !== 'string') {
    throw new Error('Missing or invalid param: "module" must be a string');
  }

  const nodes = graph.getAllNodes().filter(n => getNodeModule(n) === moduleName);
  return {
    module: moduleName,
    count: nodes.length,
    nodes: nodes.map(n => nodeDetail(n)),
  };
}

function handleListModules(graph: Graph): Record<string, unknown> {
  const modules = listModules(graph);
  return { modules, count: modules.length };
}

function handleFindPath(graph: Graph, params: Record<string, unknown>): Record<string, unknown> {
  const fromId = params['from'];
  const toId = params['to'];
  if (typeof fromId !== 'string' || typeof toId !== 'string') {
    throw new Error('Missing or invalid params: "from" and "to" must be strings');
  }

  const path = findShortestPath(graph, fromId, toId);

  if (path === null) {
    return { from: fromId, to: toId, found: false, reason: 'unreachable_or_missing_node' };
  }

  // Build path with node details
  const pathWithDetails = path.map(nid => {
    const node = graph.getNode(nid);
    return node ? nodeDetail(node) : { id: nid };
  });

  return {
    from: fromId,
    to: toId,
    found: true,
    path: pathWithDetails,
    pathIds: path,
    length: path.length - 1,
  };
}

function handleGetContext(graph: Graph, params: Record<string, unknown>): Record<string, unknown> {
  const id = params['id'];
  if (typeof id !== 'string') {
    throw new Error('Missing or invalid param: "id" must be a string');
  }

  const contextData = getContext(graph, id);

  return {
    id,
    found: graph.hasNode(id),
    nodes: contextData.nodes,
    edges: contextData.edges,
    nodeCount: contextData.nodes.length,
    edgeCount: contextData.edges.length,
  };
}

function handleExportBrainstorm(graph: Graph, workDir: string): Record<string, unknown> {
  const outputPath = exportBrainstorm(graph, workDir);
  return {
    exported: true,
    path: outputPath,
    nodeCount: graph.nodeCount,
    edgeCount: graph.edgeCount,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const workDirArg = parseArg(args, '--workdir');
  const queryArg = parseArg(args, '--query');
  const paramsArg = parseArg(args, '--params');

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  if (!queryArg) {
    return { status: 'error', message: 'Missing required argument: --query' };
  }

  if (!(VALID_QUERIES as readonly string[]).includes(queryArg)) {
    return {
      status: 'error',
      message: `Invalid --query: "${queryArg}". Valid values: ${VALID_QUERIES.join(', ')}`,
    };
  }

  const queryType = queryArg as QueryType;

  // Parse params (optional for list-modules and export-brainstorm)
  let params: Record<string, unknown> = {};
  if (paramsArg) {
    try {
      params = JSON.parse(paramsArg) as Record<string, unknown>;
    } catch {
      return { status: 'error', message: 'Invalid --params: must be valid JSON' };
    }
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  // Load the graph
  let graph: Graph;
  try {
    graph = loadGraph(workDir);
  } catch (err) {
    return { status: 'error', message: `Failed to load graph: ${(err as Error).message}` };
  }

  // Execute the query
  try {
    let result: Record<string, unknown>;

    switch (queryType) {
      case 'get-node':
        result = handleGetNode(graph, params);
        break;
      case 'get-neighbors':
        result = handleGetNeighbors(graph, params);
        break;
      case 'get-module':
        result = handleGetModule(graph, params);
        break;
      case 'list-modules':
        result = handleListModules(graph);
        break;
      case 'find-path':
        result = handleFindPath(graph, params);
        break;
      case 'get-context':
        result = handleGetContext(graph, params);
        break;
      case 'export-brainstorm':
        result = handleExportBrainstorm(graph, workDir);
        break;
    }

    return {
      status: 'ok',
      data: { query: queryType, params, result },
    };
  } catch (err) {
    return { status: 'error', message: `Query failed: ${(err as Error).message}` };
  }
}
