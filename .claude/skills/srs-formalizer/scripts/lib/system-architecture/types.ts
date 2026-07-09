/**
 * System architecture types — internal graph representations and the public
 * SystemArchitectureGraph type.
 */

export interface GenericNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface GenericEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, string>;
}

export interface GenericGraph {
  nodes: GenericNode[];
  edges: GenericEdge[];
  metadata?: Record<string, unknown>;
}

export interface SynthesisNode {
  id: string;
  layer: 'requirement' | 'behavior' | 'tla' | 'lean';
  original_labels: string[];
  properties: Record<string, string | number | boolean>;
}

export interface SynthesisEdge {
  source: string;
  target: string;
  type: 'IMPLEMENTS' | 'FORMALIZES' | 'PROVES' | 'REFINES' | 'BELONGS_TO_LAYER';
  properties?: Record<string, string>;
}

export interface ConsistencyCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: 'error' | 'warning';
}

export interface SystemArchitectureGraph {
  version: '1.0';
  nodes: SynthesisNode[];
  edges: SynthesisEdge[];
  consistency: ConsistencyCheck[];
  metadata: {
    generated_at: string;
    requirement_nodes: number;
    behavior_nodes: number;
    tla_nodes: number;
    lean_nodes: number;
    total_cross_edges: number;
    iterations: number;
    source_workdir: string;
  };
}
