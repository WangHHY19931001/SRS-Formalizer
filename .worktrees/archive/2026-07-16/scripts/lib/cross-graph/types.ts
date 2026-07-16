/**
 * Shared types for cross-graph verification.
 *
 * Extracted from cross-graph-verifier.ts and cross-graph/questions.ts to
 * break the circular dependency between the two modules.
 */

// ===================== Question Result (from cross-graph-verifier.ts) =====================

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

// ===================== Question Definitions (from cross-graph/questions.ts) =====================

export interface QuestionDef {
  id: string;
  question: string;
  expected_graphs: string[];
  min_evidence: number;
  /** Minimum total number of relevant-labeled nodes across all graphs. */
  min_relevant_nodes: number;
  optional_graphs?: string[];
}

/**
 * For each question, defines which labels each graph is expected to contain.
 * Labels are normalized (lowercased, colon prefix stripped) for matching.
 * `min_nodes` is the minimum count of nodes with relevant labels in that specific graph.
 */
export interface GraphLabelReq {
  graph: string;
  labels: string[];
  min_nodes: number;
}
