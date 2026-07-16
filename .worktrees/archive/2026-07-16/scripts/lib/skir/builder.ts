/**
 * SkIR builder — transforms RawSkillMd into SkillIR with validation.
 */

import * as crypto from 'node:crypto';
import type {
  SkillIR, ProcedureStep, Permission, PipelineStage,
  CapabilityTier, PlatformActivation, SecurityLevel,
} from '../../types/skir.js';
import type { RawSkillMd } from './types.js';

const VALID_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VALID_SECURITY_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

function normalizePermissionKind(kind: string): string {
  if (kind === 'fs') return 'filesystem';
  if (kind === 'db') return 'database';
  if (kind === 'exec') return 'execute';
  return kind;
}

export function buildSkIR(raw: RawSkillMd): SkillIR {
  const fm = raw.frontmatter;

  // Validate name
  if (!fm.name || fm.name.trim() === '') {
    throw new Error('Missing required field: name');
  }
  if (!VALID_NAME_RE.test(fm.name)) {
    throw new Error(`Invalid name format: "${fm.name}". Must be kebab-case (lowercase letters, numbers, hyphens).`);
  }

  // Validate description
  if (!fm.description || fm.description.trim() === '') {
    throw new Error('Missing required field: description');
  }
  if (fm.description.length > 1024) {
    throw new Error(`description too long: ${fm.description.length} characters (max 1024)`);
  }

  // Resolve field from top-level with metadata fallback helper
  function metaField<T>(key: string): T | undefined {
    return (fm as unknown as Record<string, unknown>)[key] as T | undefined
      ?? (fm.metadata?.[key] as T | undefined);
  }

  // Security level
  const rawSecurityLevel = metaField<string>('security_level');
  const securityLevel: SecurityLevel =
    rawSecurityLevel && VALID_SECURITY_LEVELS.has(rawSecurityLevel)
      ? (rawSecurityLevel as SecurityLevel)
      : 'medium';

  // Permissions
  const rawPermissions = metaField<Array<{ kind: string; scope: string; description?: string; read_only?: boolean }>>('permissions');
  const permissions: Permission[] = (rawPermissions || []).map(p => {
    const perm: Permission = {
      kind: normalizePermissionKind(p.kind) as Permission['kind'],
      scope: p.scope,
      read_only: p.read_only ?? false,
    };
    if (p.description !== undefined) perm.description = p.description;
    return perm;
  });

  // Pipeline stages from metadata
  const pipelineStages: PipelineStage[] = [];
  if (fm.metadata?.pipeline_stages) {
    const stageList = fm.metadata.pipeline_stages as string[];
    for (const s of stageList) {
      const parts = s.split('-');
      pipelineStages.push({
        id: parts[0]!,
        name: parts.slice(1).join('-') || parts[0]!,
        critical: parts[0] === 'S0' || parts[0] === 'S6',
      });
    }
  }

  // Capability tiers
  const capabilityTiers: CapabilityTier[] = [];
  const rawCapTiers = metaField<Record<string, { min_capability_score: number; adaptation: string }>>('capability_tiers');
  if (rawCapTiers) {
    for (const [tier, cfg] of Object.entries(rawCapTiers)) {
      capabilityTiers.push({
        tier: tier as CapabilityTier['tier'],
        min_score: cfg.min_capability_score,
        adaptation: cfg.adaptation as CapabilityTier['adaptation'],
      });
    }
  }

  // Platform activation
  const platformActivation: Record<string, PlatformActivation> = {};
  const rawPlatAct = metaField<Record<string, Record<string, unknown>>>('platform_activation');
  if (rawPlatAct) {
    for (const [plat, cfg] of Object.entries(rawPlatAct)) {
      const pa: PlatformActivation = {};
      if (cfg.hook !== undefined) pa.hook = cfg.hook as string;
      if (cfg.forced_eval !== undefined) pa.forced_eval = cfg.forced_eval as boolean;
      if (cfg.rule_type !== undefined) pa.rule_type = cfg.rule_type as string;
      if (cfg.always_apply !== undefined) pa.always_apply = cfg.always_apply as boolean;
      platformActivation[plat] = pa;
    }
  }

  // Build procedures from body sections
  const proceduresSection = raw.sections.find(
    s => s.title.toLowerCase().includes('procedure') || s.title.toLowerCase().includes('procedures')
  );
  const procedures: ProcedureStep[] = [];
  if (proceduresSection) {
    const stepLines = proceduresSection.content.split('\n')
      .filter(l => /^\d+\./.test(l.trim()));
    for (let i = 0; i < stepLines.length; i++) {
      const line = stepLines[i]!;
      const text = line.replace(/^\d+\.\s*/, '').trim();
      procedures.push({
        order: i + 1,
        instruction: text,
        is_critical: text.includes('[CRITICAL]') || text.includes('critical'),
        constraints: [],
      });
    }
  }

  // Stage gates
  const stageGates: string[] = (fm.metadata?.stage_gates as string[]) || [];

  // Source hash
  const sourceHash = crypto.createHash('sha256')
    .update(raw.body)
    .digest('hex');

  // Build return object with conditional optional fields for exactOptionalPropertyTypes
  const ir: SkillIR = {
    name: fm.name as string,
    version: metaField<string>('version') || '0.1.0',
    description: fm.description as string,
    mcp_servers: metaField<string[]>('mcp_servers') || [],
    security_level: securityLevel,
    hitl_required: metaField<boolean>('hitl_required') ?? false,
    pre_conditions: [],
    post_conditions: [],
    fallbacks: [],
    permissions,
    context_gathering: [],
    procedures,
    approaches: [],
    mode: 'sequential',
    few_shot_examples: [],
    anti_skill_constraints: [],
    extra_sections: raw.sections.filter(
      s => !s.title.toLowerCase().includes('procedure')
    ),
    requires_yaml_optimization: false,
    pipeline_stages: pipelineStages,
    capability_requirements: (fm.metadata?.capability_requirements as Record<string, Record<string, number>>) || {},
    capability_tiers: capabilityTiers,
    platform_activation: platformActivation,
    stage_gates: stageGates,
    source_path: raw.sourcePath,
    source_hash: sourceHash,
    compiled_at: new Date().toISOString(),
  };
  if (fm.input_schema) ir.input_schema = fm.input_schema;
  if (fm.output_schema) ir.output_schema = fm.output_schema;
  return ir;
}
