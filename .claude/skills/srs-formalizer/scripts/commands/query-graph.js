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
import { Graph } from '../lib/graph.js';
import { validateWorkDir } from '../lib/security.js';
const VALID_QUERIES = [
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
function parseArg(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1 || idx + 1 >= args.length)
        return null;
    return args[idx + 1];
}
/**
 * Load the graph from the workdir, trying files in priority order:
 * graph.merged.json > graph.structure_fixed.json > graph.json
 */
function loadGraph(workDir) {
    const candidates = [
        'graph.merged.json',
        'graph.structure_fixed.json',
        'graph.json',
    ];
    let graphFile = null;
    for (const name of candidates) {
        const filePath = path.join(workDir, '3_graph', 'graph', name);
        if (fs.existsSync(filePath)) {
            graphFile = filePath;
            break;
        }
    }
    if (!graphFile) {
        throw new Error('No graph file found. Tried: ' +
            candidates.map(f => `3_graph/graph/${f}`).join(', '));
    }
    const raw = fs.readFileSync(graphFile, 'utf-8');
    const graphData = JSON.parse(raw);
    return Graph.fromJSON(graphData);
}
/** Get the module name from a node's properties, defaulting to 'Unknown'. */
function getNodeModule(node) {
    const mod = node.properties['module'];
    if (typeof mod === 'string' && mod.length > 0)
        return mod;
    return 'Unknown';
}
/** Build a detail object for a node (used by get-node and get-neighbors). */
function nodeDetail(node) {
    return {
        id: node.id,
        labels: node.labels,
        properties: { ...node.properties },
    };
}
/** Compute the list of unique module names across all nodes (sorted). */
function listModules(graph) {
    const moduleSet = new Set();
    for (const node of graph.getAllNodes()) {
        moduleSet.add(getNodeModule(node));
    }
    return [...moduleSet].sort();
}
/**
 * BFS shortest path from `fromId` to `toId`.
 * Returns array of node ids forming the path, or null if unreachable.
 */
function findShortestPath(graph, fromId, toId) {
    if (!graph.hasNode(fromId) || !graph.hasNode(toId)) {
        return null;
    }
    if (fromId === toId) {
        return [fromId];
    }
    const visited = new Set([fromId]);
    const queue = [[fromId]];
    while (queue.length > 0) {
        const currentPath = queue.shift();
        const current = currentPath[currentPath.length - 1];
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
function getContext(graph, id) {
    if (!graph.hasNode(id)) {
        return { nodes: [], edges: [] };
    }
    // 1-hop neighbors (forward + reverse)
    const oneHopIds = new Set([id]);
    const forwardNeighbors = graph.getNeighbors(id);
    const backwardNeighbors = graph.getIncoming(id);
    for (const nid of forwardNeighbors)
        oneHopIds.add(nid);
    for (const nid of backwardNeighbors)
        oneHopIds.add(nid);
    // 2-hop: for each 1-hop neighbor, get their neighbors
    const twoHopIds = new Set(oneHopIds);
    for (const nid of oneHopIds) {
        if (nid === id)
            continue; // skip center to avoid re-adding
        for (const nnid of graph.getNeighbors(nid))
            twoHopIds.add(nnid);
        for (const nnid of graph.getIncoming(nid))
            twoHopIds.add(nnid);
    }
    // Collect nodes
    const contextNodes = [];
    for (const nid of twoHopIds) {
        const node = graph.getNode(nid);
        if (node)
            contextNodes.push(node);
    }
    // Collect edges where both endpoints are in the context
    const contextNodeIds = new Set(twoHopIds);
    const contextEdges = [];
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
function exportBrainstorm(graph, workDir) {
    const outputDir = path.join(workDir, '6_outputs', 'brainstorming');
    fs.mkdirSync(outputDir, { recursive: true });
    const data = graph.toJSON();
    const outputPath = path.join(outputDir, 'brainstorm_context.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    return outputPath;
}
// ---------------------------------------------------------------------------
// Query Handlers
// ---------------------------------------------------------------------------
function handleGetNode(graph, params) {
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
function handleGetNeighbors(graph, params) {
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
        .filter((n) => n !== undefined)
        .map(n => nodeDetail(n));
    const backwardNodes = backwardIds
        .map(nid => graph.getNode(nid))
        .filter((n) => n !== undefined)
        .map(n => nodeDetail(n));
    return {
        id,
        forward: forwardNodes,
        backward: backwardNodes,
    };
}
function handleGetModule(graph, params) {
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
function handleListModules(graph) {
    const modules = listModules(graph);
    return { modules, count: modules.length };
}
function handleFindPath(graph, params) {
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
function handleGetContext(graph, params) {
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
function handleExportBrainstorm(graph, workDir) {
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
export async function main(args) {
    const workDirArg = parseArg(args, '--workdir');
    const queryArg = parseArg(args, '--query');
    const paramsArg = parseArg(args, '--params');
    if (!workDirArg) {
        return { status: 'error', message: 'Missing required argument: --workdir' };
    }
    if (!queryArg) {
        return { status: 'error', message: 'Missing required argument: --query' };
    }
    if (!VALID_QUERIES.includes(queryArg)) {
        return {
            status: 'error',
            message: `Invalid --query: "${queryArg}". Valid values: ${VALID_QUERIES.join(', ')}`,
        };
    }
    const queryType = queryArg;
    // Parse params (optional for list-modules and export-brainstorm)
    let params = {};
    if (paramsArg) {
        try {
            params = JSON.parse(paramsArg);
        }
        catch {
            return { status: 'error', message: 'Invalid --params: must be valid JSON' };
        }
    }
    let workDir;
    try {
        workDir = validateWorkDir(workDirArg);
    }
    catch (err) {
        return { status: 'error', message: err.message };
    }
    // Load the graph
    let graph;
    try {
        graph = loadGraph(workDir);
    }
    catch (err) {
        return { status: 'error', message: `Failed to load graph: ${err.message}` };
    }
    // Execute the query
    try {
        let result;
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
    }
    catch (err) {
        return { status: 'error', message: `Query failed: ${err.message}` };
    }
}
//# sourceMappingURL=query-graph.js.map