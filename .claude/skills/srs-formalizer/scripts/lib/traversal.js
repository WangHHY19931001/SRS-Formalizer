/**
 * Graph traversal algorithms for SRS formalizer.
 *
 * All functions are pure (no side effects) — they only read from the Graph
 * instance and return computed results without mutating it.
 */
// ---------------------------------------------------------------------------
// bfs
// ---------------------------------------------------------------------------
/** BFS 返回从 start 可达的所有节点 id（包含 start 自身）。 */
export function bfs(graph, start) {
    if (!graph.hasNode(start))
        return [];
    const visited = new Set();
    const queue = [start];
    const result = [];
    visited.add(start);
    while (queue.length > 0) {
        const current = queue.shift();
        result.push(current);
        for (const neighbor of graph.getNeighbors(current)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// findOrphans
// ---------------------------------------------------------------------------
/** 查找孤立节点：入度 = 0 且 出度 = 0。 */
export function findOrphans(graph) {
    const orphans = [];
    for (const node of graph.getAllNodes()) {
        const neighbors = graph.getNeighbors(node.id);
        const incoming = graph.getIncoming(node.id);
        if (neighbors.length === 0 && incoming.length === 0) {
            orphans.push(node.id);
        }
    }
    return orphans;
}
// ---------------------------------------------------------------------------
// findDanglingEdges
// ---------------------------------------------------------------------------
/** 查找悬挂边：边目标节点在图中不存在。 */
export function findDanglingEdges(graph) {
    const dangling = [];
    for (const edge of graph.getAllEdges()) {
        if (!graph.hasNode(edge.target)) {
            dangling.push({ edgeId: edge.id, targetId: edge.target });
        }
    }
    return dangling;
}
// ---------------------------------------------------------------------------
// findConceptIslands
// ---------------------------------------------------------------------------
/**
 * 概念孤岛：将图视为无向图进行连通分量检测。
 *
 * 每个连通分量作为一个节点 id 数组返回。孤立节点各自成为一个分量。
 */
export function findConceptIslands(graph) {
    const visited = new Set();
    const islands = [];
    for (const node of graph.getAllNodes()) {
        if (visited.has(node.id))
            continue;
        // BFS 收集当前连通分量的所有节点（无向视角：同时遍历出边和入边）
        const component = [];
        const queue = [node.id];
        visited.add(node.id);
        while (queue.length > 0) {
            const current = queue.shift();
            component.push(current);
            for (const neighbor of graph.getNeighbors(current)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
            for (const predecessor of graph.getIncoming(current)) {
                if (!visited.has(predecessor)) {
                    visited.add(predecessor);
                    queue.push(predecessor);
                }
            }
        }
        islands.push(component);
    }
    return islands;
}
// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------
/** 计算两个集合的 Jaccard 相似度。 */
export function jaccardSimilarity(a, b) {
    const intersection = new Set([...a].filter(x => b.has(x)));
    const union = new Set([...a, ...b]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}
// ---------------------------------------------------------------------------
// findPath
// ---------------------------------------------------------------------------
/** 两节点间最短路径（BFS）。不存在时返回 null。 */
export function findPath(graph, from, to) {
    if (from === to)
        return [from];
    if (!graph.hasNode(from) || !graph.hasNode(to))
        return null;
    const visited = new Set();
    const queue = [from];
    const parent = new Map();
    visited.add(from);
    while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of graph.getNeighbors(current)) {
            if (visited.has(neighbor))
                continue;
            visited.add(neighbor);
            parent.set(neighbor, current);
            if (neighbor === to) {
                return reconstructPath(parent, from, to);
            }
            queue.push(neighbor);
        }
    }
    return null;
}
/** 从 parent 映射重建路径（内部辅助函数）。 */
function reconstructPath(parent, from, to) {
    const path = [];
    let current = to;
    while (current !== undefined) {
        path.push(current);
        if (current === from)
            break;
        current = parent.get(current);
    }
    return path.reverse();
}
//# sourceMappingURL=traversal.js.map