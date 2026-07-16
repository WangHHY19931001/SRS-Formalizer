/**
 * questions.ts — Fundamental questions and Socratic question generator
 *
 * Re-export aggregator.  Implementation lives in lib/cross-graph/.
 */

export type { QuestionDef, GraphLabelReq } from './types.js';
export { FUNDAMENTAL_QUESTIONS, QUESTION_LABEL_REQUIREMENTS, CROSS_GRAPH_EDGE_TYPES } from './questions-def.js';
export { generateSocraticQuestions } from './socratic.js';
