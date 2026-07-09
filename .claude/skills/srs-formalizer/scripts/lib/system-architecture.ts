/**
 * system-architecture.ts — System Architecture Graph (S6 系统架构图谱)
 *
 * Re-export aggregator.  Implementation lives in lib/system-architecture/.
 */

export type { SystemArchitectureGraph } from './system-architecture/types.js';
export { buildSystemArchitecture } from './system-architecture/builder.js';
export { exportSystemArchToCypher } from './system-architecture/cypher.js';
