/**
 * Graph traversal algorithms for SRS formalizer.
 *
 * All functions are pure (no side effects) — they only read from the Graph
 * instance and return computed results without mutating it.
 */
import type { Graph } from './graph.js';
/** BFS 返回从 start 可达的所有节点 id（包含 start 自身）。 */
export declare function bfs(graph: Graph, start: string): string[];
/** 查找孤立节点：入度 = 0 且 出度 = 0。 */
export declare function findOrphans(graph: Graph): string[];
/** 查找悬挂边：边目标节点在图中不存在。 */
export declare function findDanglingEdges(graph: Graph): {
    edgeId: string;
    targetId: string;
}[];
/**
 * 概念孤岛：将图视为无向图进行连通分量检测。
 *
 * 每个连通分量作为一个节点 id 数组返回。孤立节点各自成为一个分量。
 */
export declare function findConceptIslands(graph: Graph): string[][];
/** 计算两个集合的 Jaccard 相似度。 */
export declare function jaccardSimilarity(a: Set<string>, b: Set<string>): number;
/** 两节点间最短路径（BFS）。不存在时返回 null。 */
export declare function findPath(graph: Graph, from: string, to: string): string[] | null;
