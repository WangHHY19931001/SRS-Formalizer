/**
 * cross-graph-verifier.ts — Cross-graph consistency verification (S6 convergence)
 *
 * Re-export aggregator.  Implementation lives in lib/cross-graph/.
 */

export type { QuestionResult, CrossGraphReport } from './cross-graph/types.js';
export { verifyCrossGraphConsistency } from './cross-graph/verifier.js';
