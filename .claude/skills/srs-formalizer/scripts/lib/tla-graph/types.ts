/**
 * TLA+ graph types — shared interfaces for TLA+ system interaction graph.
 */

export interface TlaNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

export interface TlaEdge {
  source: string;
  target: string;
  type: 'DECOMPOSES_INTO' | 'INTERACTS_WITH' | 'TRANSITIONS_TO' | 'MAINTAINS' | 'REFERENCES';
  properties?: Record<string, string>;
}

export interface TlaGraph {
  version: '1.0';
  nodes: TlaNode[];
  edges: TlaEdge[];
  metadata: {
    generated_at: string;
    spec_count: number;
    total_actions: number;
    total_invariants: number;
    max_hierarchy_depth: number;
    source_workdir: string;
  };
}
