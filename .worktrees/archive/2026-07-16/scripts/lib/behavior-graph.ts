/**
 * behavior-graph.ts — System Behavior Graph (S4 行为图谱)
 *
 * Re-export aggregator.  Implementation lives in lib/behavior-graph/.
 */

export type { BehaviorNode, BehaviorEdge, BehaviorGraph } from './behavior-graph/types.js';
export { parseFeatureFile, type ParsedScenario, type ParsedFeature } from './behavior-graph/parser.js';
export { buildBehaviorGraphFromDir } from './behavior-graph/builder.js';
export { exportBehaviorToCypher } from './behavior-graph/cypher.js';
