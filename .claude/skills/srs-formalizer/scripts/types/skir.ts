// .claude/skills/srs-formalizer/scripts/types/skir.ts
// SkIR — Skill Intermediate Representation
// 对标 SkCC (arXiv:2605.03353) nexa-skill-core/src/ir/

// ═══════════════════════════════════════════════════════════════
// Core Enums
// ═══════════════════════════════════════════════════════════════

export type SecurityLevel = 'low' | 'medium' | 'high' | 'critical';

export type SkillMode = 'sequential' | 'alternative' | 'toolkit' | 'guideline';

export type PermissionKind =
  | 'network'
  | 'filesystem'
  | 'database'
  | 'execute'
  | 'mcp'
  | 'environment';

export type ConstraintLevel = 'warning' | 'error' | 'critical';

// ═══════════════════════════════════════════════════════════════
// Constraint
// ═══════════════════════════════════════════════════════════════

export interface ConstraintScopeGlobal {
  type: 'global';
}

export interface ConstraintScopeSpecificSteps {
  type: 'specific_steps';
  step_ids: number[];
}

export interface ConstraintScopeKeywordMatch {
  type: 'keyword_match';
  keywords: string[];
}

export type ConstraintScope =
  | ConstraintScopeGlobal
  | ConstraintScopeSpecificSteps
  | ConstraintScopeKeywordMatch;

export interface Constraint {
  /** 注入来源: 'anti-skill-injector' | 'user_defined' */
  source: string;
  /** 约束内容文本 */
  content: string;
  /** 严重级别 */
  level: ConstraintLevel;
  /** 作用范围 */
  scope: ConstraintScope;
}

// ═══════════════════════════════════════════════════════════════
// Permission
// ═══════════════════════════════════════════════════════════════

export interface Permission {
  kind: PermissionKind;
  scope: string;
  description?: string;
  read_only: boolean;
}

// ═══════════════════════════════════════════════════════════════
// ProcedureStep
// ═══════════════════════════════════════════════════════════════

export interface RetryStrategy {
  max_attempts: number;
  delay_ms: number;
}

export interface FallbackStrategy {
  alternative_step: string;
}

export type ErrorHandling =
  | { type: 'stop' }
  | { type: 'skip' }
  | { type: 'retry'; config: RetryStrategy }
  | { type: 'fallback'; config: FallbackStrategy }
  | { type: 'request_human' };

export interface ProcedureStep {
  order: number;
  instruction: string;
  is_critical: boolean;
  constraints: string[];
  expected_output?: string;
  on_error?: ErrorHandling;
}

// ═══════════════════════════════════════════════════════════════
// Approach
// ═══════════════════════════════════════════════════════════════

export interface Approach {
  name: string;
  description: string;
  instructions: string;
}

// ═══════════════════════════════════════════════════════════════
// Example
// ═══════════════════════════════════════════════════════════════

export interface Example {
  title?: string;
  user_input: string;
  agent_response: string;
  tags: string[];
  difficulty?: 'basic' | 'intermediate' | 'advanced';
}

// ═══════════════════════════════════════════════════════════════
// SectionInfo
// ═══════════════════════════════════════════════════════════════

export interface SectionInfo {
  level: number;
  title: string;
  content: string;
}

// ═══════════════════════════════════════════════════════════════
// PipelineStage
// ═══════════════════════════════════════════════════════════════

export interface PipelineStage {
  id: string;
  name: string;
  critical: boolean;
  substages?: PipelineStage[];
}

// ═══════════════════════════════════════════════════════════════
// CapabilityTier
// ═══════════════════════════════════════════════════════════════

export interface CapabilityTier {
  tier: 'strong' | 'medium' | 'weak';
  min_score: number;
  adaptation: 'full_auto' | 'guided' | 'human_in_loop';
}

// ═══════════════════════════════════════════════════════════════
// PlatformActivation
// ═══════════════════════════════════════════════════════════════

export interface PlatformActivation {
  hook?: string;
  forced_eval?: boolean;
  rule_type?: string;
  always_apply?: boolean;
  scan_keywords?: boolean;
  command?: string;
  agents_md?: string;
}

// ═══════════════════════════════════════════════════════════════
// CheckResult (compile-time validation)
// ═══════════════════════════════════════════════════════════════

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

// ═══════════════════════════════════════════════════════════════
// SkillIR — Core Intermediate Representation
// ═══════════════════════════════════════════════════════════════

export interface SkillIR {
  // ── Metadata & Routing ──
  name: string;
  version: string;
  description: string;

  // ── MCP & Schemas ──
  mcp_servers: string[];
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;

  // ── Security & Control ──
  security_level: SecurityLevel;
  hitl_required: boolean;
  pre_conditions: string[];
  post_conditions: string[];
  fallbacks: string[];
  permissions: Permission[];

  // ── Execution Logic ──
  context_gathering: string[];
  procedures: ProcedureStep[];
  approaches: Approach[];
  mode: SkillMode;
  few_shot_examples: Example[];

  // ── Compile-time Injection ──
  anti_skill_constraints: Constraint[];

  // ── Extra Sections ──
  extra_sections: SectionInfo[];

  // ── Format Optimization Flags ──
  requires_yaml_optimization: boolean;
  nested_data_depth?: number;

  // ── srs-formalizer Extensions ──
  pipeline_stages: PipelineStage[];
  capability_requirements: Record<string, Record<string, number>>;
  capability_tiers: CapabilityTier[];
  platform_activation: Record<string, PlatformActivation>;
  stage_gates: string[];

  // ── Meta (not emitted) ──
  source_path: string;
  source_hash: string;
  compiled_at: string;
}
