/**
 * Lean 4 graph types — shared interfaces for Lean proof dependency graph.
 */

export interface LeanNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

export interface LeanEdge {
  source: string;
  target: string;
  type: 'PROVES' | 'DEPENDS_ON' | 'IMPORTS' | 'USES';
  properties?: Record<string, string>;
}

export interface LeanGraph {
  version: '1.0';
  nodes: LeanNode[];
  edges: LeanEdge[];
  metadata: {
    generated_at: string;
    file_count: number;
    theorem_count: number;
    lemma_count: number;
    axiom_count: number;
    sorry_count: number;
    import_count: number;
    max_proof_depth: number;
    source_workdir: string;
  };
}
