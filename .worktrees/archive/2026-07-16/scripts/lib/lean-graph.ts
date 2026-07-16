/**
 * lean-graph.ts — Lean 4 Proof Dependency Graph (S5 算法序列图谱)
 *
 * Re-export aggregator.  Implementation lives in lib/lean-graph/.
 */

export type { LeanNode, LeanEdge, LeanGraph } from './lean-graph/types.js';
export { parseLeanFile, type ParsedLeanFile } from './lean-graph/parser.js';
export { buildLeanGraphFromDir } from './lean-graph/builder.js';
export { exportLeanToCypher } from './lean-graph/cypher.js';
