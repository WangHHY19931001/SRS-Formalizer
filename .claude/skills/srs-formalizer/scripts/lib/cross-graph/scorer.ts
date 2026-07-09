/**
 * Evidence scoring for cross-graph questions — evaluates whether graphs
 * contain sufficient evidence to answer each fundamental question.
 */

import type { QuestionDef, QuestionResult } from './types.js';
import type { GraphMeta } from './graph-loader.js';
import { QUESTION_LABEL_REQUIREMENTS, CROSS_GRAPH_EDGE_TYPES } from './questions-def.js';

export function scoreQuestion(
  graphs: Map<string, GraphMeta>,
  question: QuestionDef,
): QuestionResult {
  const evidence: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const labelReqs = QUESTION_LABEL_REQUIREMENTS[question.id] || [];
  let totalRelevantNodes = 0;
  let totalRelevantEdges = 0;
  let graphsWithRelevantContent = 0;
  let crossEdgeStatus: "ok" | "missing_arch" | "missing_edge" = "ok";

  for (const g of question.expected_graphs) {
    const meta = graphs.get(g);
    if (!meta || !meta.exists) {
      gaps.push(`${g}: file not found`);
      recommendations.push(`Run the corresponding build-* command for ${g}`);
      continue;
    }

    const req = labelReqs.find((r) => r.graph === g);

    if (req) {
      let relevantNodeCount = 0;
      const matchedLabels: string[] = [];
      for (const label of req.labels) {
        const count = meta.labelCounts[label] || 0;
        if (count > 0) { relevantNodeCount += count; matchedLabels.push(label); }
      }

      if (matchedLabels.length === 0) {
        const foundLabels = Object.keys(meta.labelCounts);
        const labelStr = req.labels.join(", ");
        gaps.push(`${g}: no relevant node types (expected: ${labelStr}; found: ${foundLabels.length > 0 ? foundLabels.join(", ") : "none"})`);
        recommendations.push(`Add nodes with relevant labels to ${g}: ${labelStr}`);
      } else if (relevantNodeCount < req.min_nodes) {
        gaps.push(`${g}: ${relevantNodeCount}/${req.min_nodes} relevant nodes only`);
        recommendations.push(`Add more relevant nodes to ${g} (need >= ${req.min_nodes})`);
      } else {
        evidence.push(g);
        graphsWithRelevantContent++;
        totalRelevantNodes += relevantNodeCount;
        if (meta.edges > 0) totalRelevantEdges += meta.edges;
      }
    } else {
      if (meta.nodes > 0) {
        evidence.push(g);
        graphsWithRelevantContent++;
        totalRelevantNodes += meta.nodes;
        totalRelevantEdges += meta.edges;
      } else {
        gaps.push(`${g}: exists but has 0 nodes`);
        recommendations.push(`Ensure ${g} has meaningful content (>0 nodes)`);
      }
    }
  }

  // Cross-Graph Edge Validation
  const requiredEdgeTypes = CROSS_GRAPH_EDGE_TYPES[question.id];
  if (requiredEdgeTypes && requiredEdgeTypes.length > 0 && evidence.length >= 2) {
    const archMeta = graphs.get("system-architecture.json");
    if (archMeta?.exists) {
      const foundTypes = requiredEdgeTypes.filter((t) => (archMeta.edgeTypes[t] || 0) > 0);
      if (foundTypes.length === 0) {
        crossEdgeStatus = "missing_edge";
        gaps.push(`system-architecture.json lacks cross-graph edges (expected: ${requiredEdgeTypes.join("/")})`);
        recommendations.push("Establish cross-layer connections between graphs (IMPLEMENTS/FORMALIZES/PROVES/REFINES)");
      }
    } else {
      crossEdgeStatus = "missing_arch";
    }
  }

  // Optional Graph Note
  const anyOptionalFound = question.optional_graphs?.some((g: string) => graphs.get(g)?.exists);
  if (!anyOptionalFound && question.optional_graphs && question.optional_graphs.length > 0 &&
      graphsWithRelevantContent < question.min_evidence) {
    gaps.push("Optional formal verification graph not found (TLA+/Lean) — consider running S5");
    recommendations.push("If the system involves algorithms/state machines, trigger S5");
  }

  // Confidence
  const hasMinEvidence = graphsWithRelevantContent >= question.min_evidence;
  const hasMinNodes = totalRelevantNodes >= question.min_relevant_nodes;
  const hasEdges = totalRelevantEdges > 0;
  const crossEdgesOk = crossEdgeStatus === "ok";

  let confidence: QuestionResult["confidence"] = "none";
  if (hasMinEvidence && hasMinNodes && hasEdges && crossEdgesOk) {
    confidence = "high";
  } else if (graphsWithRelevantContent >= Math.max(1, question.min_evidence - 1) && totalRelevantNodes >= 1) {
    confidence = "medium";
  } else if (graphsWithRelevantContent >= 1 || totalRelevantNodes > 0) {
    confidence = "low";
  }

  return { question: question.question, answerable: confidence === "high" || confidence === "medium", confidence, evidence, gaps, recommendations };
}
