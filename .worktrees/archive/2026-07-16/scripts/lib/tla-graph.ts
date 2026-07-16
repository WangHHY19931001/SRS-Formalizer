/**
 * tla-graph.ts — TLA+ System Interaction Graph (S5 系统交互图谱)
 *
 * Re-export aggregator.  Implementation lives in lib/tla-graph/.
 */

export type { TlaNode, TlaEdge, TlaGraph } from './tla-graph/types.js';
export { parseTlaFile, type ParsedTlaModule } from './tla-graph/parser.js';
export { buildTlaGraphFromDir } from './tla-graph/builder.js';
export { exportTlaToCypher } from './tla-graph/cypher.js';
