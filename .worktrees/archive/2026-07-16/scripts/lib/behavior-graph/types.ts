/**
 * Behavior graph types for BDD system behavior graph.
 */

export interface BehaviorNode {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
}

export interface BehaviorEdge {
  source: string;
  target: string;
  type: 'BELONGS_TO' | 'HAS_STEP' | 'DEPENDS_ON' | 'VERIFIES' | 'PRECONDITION' | 'POSTCONDITION';
  properties?: Record<string, string>;
}

export interface BehaviorGraph {
  version: '1.0';
  nodes: BehaviorNode[];
  edges: BehaviorEdge[];
  metadata: {
    generated_at: string;
    feature_count: number;
    scenario_count: number;
    action_count: number;
    source_workdir: string;
  };
}
