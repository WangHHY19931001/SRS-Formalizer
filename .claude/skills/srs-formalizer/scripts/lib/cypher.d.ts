import type { Graph, GraphNode, GraphEdge } from './graph.js';
/** 生成 CREATE 节点语句 */
export declare function generateCreateNode(node: GraphNode): string;
/** 生成 CREATE 边语句 */
export declare function generateCreateEdge(edge: GraphEdge): string;
/** 生成唯一性约束 */
export declare function generateConstraints(): string[];
/** 生成完整 Cypher 脚本 */
export declare function generateFullScript(graph: Graph): string;
