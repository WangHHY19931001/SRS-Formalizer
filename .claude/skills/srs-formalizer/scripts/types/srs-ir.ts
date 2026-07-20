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

/**
 * Selective-formalization priority (proposal §P1-3). Drives which requirements
 * MUST be covered by TLA+/Lean4 and which may be deferred. `safety-critical`
 * coverage gaps are blocking at FINAL; others are advisory.
 */
export type FormalizationPriority = 'safety-critical' | 'concurrency' | 'standard' | 'deferred';

export interface IRProperties {
  statement?: string;
  category?: 'explicit' | 'implicit' | 'relational';
  confidence?: 'high' | 'medium' | 'low';
  nfrCategory?: NFRCategory;
  nfrThreshold?: NFRThreshold;
  archType?: 'Module' | 'Actor' | 'Constraint' | 'Component' | 'Interface';
  /** Selective-formalization priority (proposal §P1-3). Absent ⇒ 'standard'. */
  formalizationPriority?: FormalizationPriority;
  /** Frozen-asset RID this node was derived from (proposal §P1-2), when known. */
  ridRef?: string;
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

// ===========================================================================
// RID ↔ IR mapping contract (proposal §P1-2)
// ===========================================================================

/**
 * Authoritative mapping between a frozen-asset RID (e.g. `RID-BDD-LOOP-001`)
 * and the IR node id(s) it was derived into (e.g. `R1-S012-0003`). Written to
 * `_ctx/rid_mapping.json` during the frontend so downstream traceability keys on
 * RID rather than the skill-local `R1-Sxxx` ids, closing the断链 the review
 * flagged. `matchType` records how the link was established so a reviewer can
 * distinguish an explicit tag from a heuristic inference.
 */
export interface RidMappingEntry {
  rid: string;
  irNodeIds: string[];
  matchType: 'explicit-tag' | 'statement-similarity' | 'manual';
  confidence: number;
  note?: string;
}

export interface RidMapping {
  version: '1.0';
  sourcePath: string;
  generatedAt: string;
  entries: RidMappingEntry[];
  /** RIDs discovered in frozen assets that no IR node maps to (coverage holes). */
  unmappedRids: string[];
  /** IR requirement node ids that map to no RID (provenance holes). */
  unmappedNodeIds: string[];
}
