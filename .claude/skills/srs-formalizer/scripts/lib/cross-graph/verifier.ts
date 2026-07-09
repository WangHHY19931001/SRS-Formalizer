/**
 * Cross-graph consistency verifier — orchestrates graph loading, scoring,
 * and Socratic question generation for the S6 refinement loop.
 */

import type { CrossGraphReport } from './types.js';
import type { GraphMeta } from './graph-loader.js';
import { loadGraphMeta } from './graph-loader.js';
import { FUNDAMENTAL_QUESTIONS } from './questions-def.js';
import { scoreQuestion } from './scorer.js';
import { generateSocraticQuestions } from './socratic.js';

export function verifyCrossGraphConsistency(
  workDir: string,
  iteration: number,
): CrossGraphReport {
  const graphNames = [
    "requirement_graph.json",
    "behavior_graph.json",
    "tla-interaction-graph.json",
    "lean-proof-graph.json",
    "system-architecture.json",
    "architecture_graph.json",
  ];

  const graphs = new Map<string, GraphMeta>();
  const loaded: string[] = [];
  const missing: string[] = [];

  for (const name of graphNames) {
    const meta = loadGraphMeta(workDir, name);
    if (meta) {
      graphs.set(name, meta);
      loaded.push(name);
    } else {
      missing.push(name);
      graphs.set(name, { path: "", exists: false, nodes: 0, edges: 0, layers: [], labelCounts: {}, edgeTypes: {} });
    }
  }

  const results = FUNDAMENTAL_QUESTIONS.map((q) => scoreQuestion(graphs, q));

  const answerable = results.filter((r) => r.answerable);
  const unanswerable = results.filter((r) => !r.answerable);
  const highConf = results.filter((r) => r.confidence === "high");
  const lowConf = results.filter((r) => r.confidence === "low" || r.confidence === "none");

  const needsHuman = unanswerable.length > 0 && iteration >= 3;
  const humanQuestions = needsHuman ? generateSocraticQuestions(unanswerable) : [];

  return {
    version: "1.0",
    generated_at: new Date().toISOString(),
    iteration,
    overall_converged: unanswerable.length === 0,
    questions: results,
    summary: {
      total_questions: results.length,
      answerable: answerable.length,
      unanswerable: unanswerable.length,
      high_confidence: highConf.length,
      low_confidence: lowConf.length,
      needs_human: needsHuman,
      human_questions: humanQuestions,
    },
    metadata: {
      graphs_loaded: loaded,
      graphs_missing: missing,
      source_workdir: workDir,
    },
  };
}
