/**
 * types.ts — Shared types for the capability probe system
 */

export type Dimension =
  | 'instruction_following'
  | 'structured_output'
  | 'precision'
  | 'hierarchical_reasoning'
  | 'logical_reasoning'
  | 'creative_reasoning'
  | 'formal_tlaplus'
  | 'formal_lean4';

export interface ProbeItem {
  probe_id: string;
  dimension: Dimension;
  prompt: string;
  expected: {
    min_records?: number;
    max_records?: number;
    checks: string[];
    /** Precision-specific: real requirement keywords to match */
    expected_real_reqs?: string[];
    /** Precision-specific: fake requirement keywords to reject */
    fake_keywords?: string[];
    /** Hierarchical reasoning-specific: FR-ID to module mapping */
    hierarchy_expected?: Record<string, string>;
    /** Logical reasoning-specific: expected relations (DEPENDS_ON, REFINES, CONFLICTS_WITH) */
    logical_expected?: Array<{ source: string; target: string; relation?: string }>;
    /** Instruction-following: expected ID prefix (default R1) */
    id_prefix?: string;
    /** Instruction-following: LLM should refuse template with missing required fields */
    refuse_missing_field?: boolean;
    /** Instruction-following: LLM should output zero records for empty input */
    empty_input?: boolean;
    /** Instruction-following: LLM should refuse wrong/unsafe template */
    refuse_wrong_template?: boolean;
    /** Structured-output: answer must contain nested metadata objects */
    nested_metadata?: boolean;
    /** Structured-output: answer must handle Unicode/mixed-language content */
    unicode_content?: boolean;
    /** Structured-output: answer must detect and handle contradictory info */
    contradiction_detection?: boolean;
    /** Structured-output: answer must handle ultra-long text without truncation */
    long_text?: boolean;
    /** Precision: LLM must deduplicate synonymous requirements */
    dedup_required?: boolean;
    /** Precision: LLM must resolve cross-line "同上" references */
    cross_line_ref?: boolean;
    /** Precision: LLM must extract requirements from code comments */
    in_code_comment?: boolean;
    /** Creative-reasoning: specific domain for implicit requirement derivation */
    creative_domain?: 'security' | 'integration' | 'concurrency' | 'fault_tolerance';
    /** Logical-reasoning: expected relation type for this probe */
    relation_type?: string;
    /** Logical-reasoning: LLM must detect transitive dependencies */
    transitive_dep?: boolean;
    /** Logical-reasoning: LLM must detect cyclic dependencies */
    cyclic_dep?: boolean;
  };
}

export interface ProbeResult {
  probe_id: string;
  dimension: Dimension;
  score: number;
  details: string[];
  passed: boolean;
}

export interface CapabilityProfile {
  instruction_following: number;
  structured_output: number;
  precision: number;
  hierarchical_reasoning: number;
  logical_reasoning: number;
  creative_reasoning: number;
  formal_tlaplus: number;
  formal_lean4: number;
}

export type Tier = 'low' | 'medium' | 'high';
