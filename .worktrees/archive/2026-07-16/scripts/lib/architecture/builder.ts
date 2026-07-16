/**
 * builder.ts — Core architecture graph building logic
 *
 * Re-export aggregator.  Implementation lives in lib/architecture/.
 */

export type { Arch1Record, Arch2Record, Arch3Record, ArchMetrics } from './types.js';
export { readJsonLines, loadGraph, buildNameMap, ensureModuleNode, graphHasEdge, findNodeByName } from './graph-utils.js';
export { processArch1 } from './processors/arch1.js';
export { processArch2 } from './processors/arch2.js';
export { processArch3 } from './processors/arch3.js';
