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

export type IREdgeType =
  | 'depends_on'
  | 'refines'
  | 'conflicts_with'
  | 'derived_from'
  | 'same_aspect'
  | 'contains'
  | 'nfr_impacts'
  | 'nfr_constrains'
  | 'cross_file_depends'
  | 'verifies'
  | 'implements'
  | 'proves'
  | 'traces_to';

export interface IREdgeProperties {
  crossFileWeight?: number;
  confidence?: number;
  reasoning?: string;
  proposed?: boolean;
}

export interface IREdge {
  id: string;
  source: string;
  target: string;
  type: IREdgeType;
  properties: IREdgeProperties;
}

export interface IRMeta {
  sourcePath: string;
  sourceHash: string;
  language: 'zh' | 'en';
  totalChars: number;
  totalShards: number;
  totalNodes: number;
  totalEdges: number;
  buildTimestamp: string;
  riskScore?: number;
  highRiskShards?: string[];
}

export interface CrossRef {
  sourceShard: string;
  targetShard: string;
  refType: 'heading_ref' | 'term_ref' | 'explicit_see' | 'implicit_dep';
  anchorText: string;
  confidence: number;
}

export interface NFRProfile {
  detectedCategories: NFREntry[];
  weightedShards: NFRWeightedShard[];
  overallCoverage: number;
  blindSpots: NFRCategory[];
}

export interface NFREntry {
  category: NFRCategory;
  keywordHits: number;
  shardIds: string[];
  nodeIds: string[];
}

export interface NFRWeightedShard {
  shardId: string;
  nfrWeight: number;
  primaryCategory?: NFRCategory;
}

export interface IRGap {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference'
      | 'incomplete_section' | 'cross_chapter_gap';
  description: string;
  sourceChapter: string;
}

export interface IRGlossaryEntry {
  term: string;
  acronym?: string;
  definition: string;
  sourceShard: string;
  confidence: 'high' | 'medium' | 'low';
  category: 'domain_concept' | 'acronym' | 'technical_entity'
          | 'business_entity' | 'defined_term';
}

export interface SRSIR {
  version: '2.0.0';
  meta: IRMeta;
  nodes: IRNode[];
  edges: IREdge[];
  crossRefs: CrossRef[];
  nfrProfile: NFRProfile;
  gaps: IRGap[];
  glossary: IRGlossaryEntry[];
}
