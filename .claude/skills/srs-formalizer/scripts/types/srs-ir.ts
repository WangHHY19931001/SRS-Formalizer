export type NFRCategory =
  | 'performance'
  | 'security'
  | 'availability'
  | 'compatibility'
  | 'maintainability'
  | 'compliance';

export interface NFRThreshold {
  metric: string;
  value: number;
  unit: string;
  operator: '<' | '<=' | '>' | '>=' | '==';
}

export type IRNodeType =
  | 'requirement'
  | 'nfr'
  | 'architecture'
  | 'bdd_scenario'
  | 'tla_action'
  | 'tla_invariant'
  | 'lean_theorem'
  | 'lean_lemma';

export interface IRProperties {
  statement?: string;
  category?: 'explicit' | 'implicit' | 'relational';
  confidence?: 'high' | 'medium' | 'low';
  nfrCategory?: NFRCategory;
  nfrThreshold?: NFRThreshold;
  archType?: 'Module' | 'Actor' | 'Constraint' | 'Component' | 'Interface';
}

export interface IRSource {
  filePath: string;
  startLine: number;
  endLine: number;
  shardId: string;
  chapter: string;
}

export interface IRAnalysis {
  structure?: {
    orphan: boolean;
    islandId?: string;
    crossFileIsland: boolean;
  };
  semantic?: {
    duplicatePair?: string;
    conflictPair?: string;
    sameAspectCluster?: string;
  };
}

export interface IRNode {
  id: string;
  type: IRNodeType;
  module: string;
  labels: string[];
  properties: IRProperties;
  source: IRSource;
  analysis?: IRAnalysis;
}
