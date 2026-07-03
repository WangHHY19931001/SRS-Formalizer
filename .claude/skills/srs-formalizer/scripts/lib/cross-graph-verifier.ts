/**
 * cross-graph-verifier.ts — Cross-graph consistency verification (S6 convergence)
 *
 * During the S6 refinement loop, checks whether ALL produced artifacts
 * (requirement graph, behavior graph, interaction graphs, architecture graph)
 * can collectively answer 10 fundamental questions about the system.
 *
 * Enhanced with semantic node label checking and cross-graph edge validation
 * to replace the previous file-existence-only heuristic.
 *
 * If any question cannot be answered → continue refinement loop.
 * If multiple iterations fail → escalate to human via Socratic questioning.
 *
 * Question definitions, label requirements, cross-graph edge types, and the
 * Socratic question generator live in ./cross-graph/questions.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  FUNDAMENTAL_QUESTIONS,
  QUESTION_LABEL_REQUIREMENTS,
  CROSS_GRAPH_EDGE_TYPES,
  generateSocraticQuestions,
} from './cross-graph/questions.js';
import type { QuestionDef } from './cross-graph/questions.js';

// ===================== Types =====================

export interface QuestionResult {
  question: string;
  answerable: boolean;
  confidence: "high" | "medium" | "low" | "none";
  evidence: string[]; // paths to graph files that provide evidence
  gaps: string[]; // what's missing
  recommendations: string[]; // how to fix
}

export interface CrossGraphReport {
  version: "1.0";
  generated_at: string;
  iteration: number;
  overall_converged: boolean;
  questions: QuestionResult[];
  summary: {
    total_questions: number;
    answerable: number;
    unanswerable: number;
    high_confidence: number;
    low_confidence: number;
    needs_human: boolean;
    human_questions: string[]; // Socratic questions with options
  };
  metadata: {
    graphs_loaded: string[];
    graphs_missing: string[];
    source_workdir: string;
  };
}

// ===================== Graph Loader =====================

interface GraphMeta {
  path: string;
  exists: boolean;
  nodes: number;
  edges: number;
  layers: string[];
  /** Normalized label → count mapping (lowercased, colon prefix stripped). */
  labelCounts: Record<string, number>;
  /** Edge type → count mapping (for cross-graph edge verification). */
  edgeTypes: Record<string, number>;
}

/** Normalize a label for matching: strip leading ':' and lowercase. */
function normalizeLabel(l: string): string {
  return l.replace(/^:/, "").toLowerCase();
}

/**
 * Load graph metadata from known directory candidates.
 * Handles both GraphData shape ({nodes, edges} with labels arrays) and
 * SystemArchitectureGraph shape ({nodes: SynthesisNode[], edges: SynthesisEdge[]}
 * which may use 'original_labels' instead of 'labels').
 */
function loadGraphMeta(workDir: string, graphFile: string): GraphMeta | null {
  const candidates = [
    path.join(workDir, "3_graph", "graph", graphFile),
    path.join(workDir, "4_bdd", graphFile),
    path.join(workDir, "5_formal", graphFile),
    path.join(workDir, "6_outputs", graphFile),
    path.join(workDir, "6_outputs", "system-architecture.json"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        const nodes = data.nodes?.length || 0;
        const edges = data.edges?.length || 0;

        // Compute normalized label counts
        // Handle both 'labels' (GraphNode) and 'original_labels' (SynthesisNode) fields
        const labelCounts: Record<string, number> = {};
        const rawLabels = new Set<string>();
        if (data.nodes) {
          for (const n of data.nodes) {
            const nodeLabels = n.labels || n.original_labels || [];
            if (Array.isArray(nodeLabels)) {
              for (const l of nodeLabels) {
                rawLabels.add(l);
                const norm = normalizeLabel(l);
                labelCounts[norm] = (labelCounts[norm] || 0) + 1;
              }
            }
          }
        }

        // Compute edge type counts (for cross-graph edge verification)
        const edgeTypes: Record<string, number> = {};
        if (data.edges) {
          for (const e of data.edges) {
            const t = String(e.type || "unknown");
            edgeTypes[t] = (edgeTypes[t] || 0) + 1;
          }
        }

        return {
          path: p,
          exists: true,
          nodes,
          edges,
          layers: [...rawLabels],
          labelCounts,
          edgeTypes,
        };
      } catch {
        return null;
      }
    }
  }

  // Fallback: check workDir root
  const rootPath = path.join(workDir, graphFile);
  if (fs.existsSync(rootPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(rootPath, "utf-8"));
      return {
        path: rootPath,
        exists: true,
        nodes: data.nodes?.length || 0,
        edges: data.edges?.length || 0,
        layers: [],
        labelCounts: {},
        edgeTypes: {},
      };
    } catch {
      /* skip */
    }
  }

  return null;
}

// ===================== Evidence Scoring =====================

function scoreQuestion(
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

    // Find label requirements for this specific graph
    const req = labelReqs.find((r) => r.graph === g);

    if (req) {
      // Count nodes with required labels
      let relevantNodeCount = 0;
      const matchedLabels: string[] = [];
      for (const label of req.labels) {
        const count = meta.labelCounts[label] || 0;
        if (count > 0) {
          relevantNodeCount += count;
          matchedLabels.push(label);
        }
      }

      if (matchedLabels.length === 0) {
        // Graph exists but has no nodes with the required labels
        const foundLabels = Object.keys(meta.labelCounts);
        const labelStr = req.labels.join(", ");
        gaps.push(
          `${g}: no relevant node types (expected: ${labelStr}; found: ${foundLabels.length > 0 ? foundLabels.join(", ") : "none"})`,
        );
        recommendations.push(
          `Add nodes with relevant labels to ${g}: ${labelStr}`,
        );
      } else if (relevantNodeCount < req.min_nodes) {
        // Some relevant nodes exist but not enough
        gaps.push(
          `${g}: ${relevantNodeCount}/${req.min_nodes} relevant nodes only`,
        );
        recommendations.push(
          `Add more relevant nodes to ${g} (need >= ${req.min_nodes})`,
        );
      } else {
        // Sufficient relevant content found
        evidence.push(g);
        graphsWithRelevantContent++;
        totalRelevantNodes += relevantNodeCount;
        if (meta.edges > 0) totalRelevantEdges += meta.edges;
      }
    } else {
      // No specific label requirement — check for any content
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

  // ===================== Cross-Graph Edge Validation =====================
  // When a question requires multiple graphs that should be connected,
  // check that the synthesized system-architecture.json has the appropriate
  // cross-layer edge types (IMPLEMENTS, FORMALIZES, PROVES, REFINES).

  const requiredEdgeTypes = CROSS_GRAPH_EDGE_TYPES[question.id];
  if (
    requiredEdgeTypes &&
    requiredEdgeTypes.length > 0 &&
    evidence.length >= 2
  ) {
    const archMeta = graphs.get("system-architecture.json");
    if (archMeta?.exists) {
      const foundTypes = requiredEdgeTypes.filter(
        (t) => (archMeta.edgeTypes[t] || 0) > 0,
      );
      if (foundTypes.length === 0) {
        crossEdgeStatus = "missing_edge";
        gaps.push(
          `system-architecture.json lacks cross-graph edges (expected: ${requiredEdgeTypes.join("/")})`,
        );
        recommendations.push(
          "Establish cross-layer connections between graphs (IMPLEMENTS/FORMALIZES/PROVES/REFINES)",
        );
      }
    } else {
      crossEdgeStatus = "missing_arch";
    }
  }

  // ===================== Optional Graph Note =====================

  const anyOptionalFound = question.optional_graphs?.some(
    (g: string) => graphs.get(g)?.exists,
  );
  if (
    !anyOptionalFound &&
    question.optional_graphs &&
    question.optional_graphs.length > 0 &&
    graphsWithRelevantContent < question.min_evidence
  ) {
    gaps.push(
      "Optional formal verification graph not found (TLA+/Lean) — consider running S5",
    );
    recommendations.push(
      "If the system involves algorithms/state machines, trigger S5",
    );
  }

  // ===================== Confidence =====================

  const hasMinEvidence = graphsWithRelevantContent >= question.min_evidence;
  const hasMinNodes = totalRelevantNodes >= question.min_relevant_nodes;
  const hasEdges = totalRelevantEdges > 0;
  const crossEdgesOk = crossEdgeStatus === "ok";

  let confidence: QuestionResult["confidence"] = "none";

  if (hasMinEvidence && hasMinNodes && hasEdges && crossEdgesOk) {
    confidence = "high";
  } else if (
    graphsWithRelevantContent >= Math.max(1, question.min_evidence - 1) &&
    totalRelevantNodes >= 1
  ) {
    confidence = "medium";
  } else if (graphsWithRelevantContent >= 1 || totalRelevantNodes > 0) {
    confidence = "low";
  }

  return {
    question: question.question,
    answerable: confidence === "high" || confidence === "medium",
    confidence,
    evidence,
    gaps,
    recommendations,
  };
}

// ===================== Main Verifier =====================

export function verifyCrossGraphConsistency(
  workDir: string,
  iteration: number,
): CrossGraphReport {
  // Load all available graphs
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
      graphs.set(name, {
        path: "",
        exists: false,
        nodes: 0,
        edges: 0,
        layers: [],
        labelCounts: {},
        edgeTypes: {},
      });
    }
  }

  // Score all 10 questions
  const results = FUNDAMENTAL_QUESTIONS.map((q) => scoreQuestion(graphs, q));

  const answerable = results.filter((r) => r.answerable);
  const unanswerable = results.filter((r) => !r.answerable);
  const highConf = results.filter((r) => r.confidence === "high");
  const lowConf = results.filter(
    (r) => r.confidence === "low" || r.confidence === "none",
  );

  // Generate Socratic questions for gaps
  const needsHuman = unanswerable.length > 0 && iteration >= 3;
  const humanQuestions = needsHuman
    ? generateSocraticQuestions(unanswerable)
    : [];

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
