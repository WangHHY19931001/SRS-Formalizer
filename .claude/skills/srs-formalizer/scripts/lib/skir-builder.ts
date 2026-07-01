// .claude/skills/srs-formalizer/scripts/lib/skir-builder.ts
// SkIR Builder -- RawAST -> SkillIR transformation
// DuiBiao SkCC nexa-skill-core/src/ir/builder.rs

import * as crypto from 'node:crypto';
import type {
  SkillIR, ProcedureStep, Permission, PipelineStage,
  CapabilityTier, PlatformActivation, SectionInfo, SecurityLevel,
} from '../types/skir.js';

export interface RawFrontmatter {
  name: string;
  version?: string;
  description: string;
  compatibility?: string;
  security_level?: string;
  hitl_required?: boolean;
  mcp_servers?: string[];
  permissions?: Array<{
    kind: string;
    scope: string;
    description?: string;
    read_only?: boolean;
  }>;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  capability_tiers?: Record<string, { min_capability_score: number; adaptation: string }>;
  platform_activation?: Record<string, Record<string, unknown>>;
}

export interface RawSkillMd {
  frontmatter: RawFrontmatter;
  body: string;
  sections: SectionInfo[];
  sourcePath: string;
}

const VALID_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VALID_SECURITY_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

function normalizePermissionKind(kind: string): string {
  if (kind === 'fs') return 'filesystem';
  if (kind === 'db') return 'database';
  if (kind === 'exec') return 'execute';
  return kind;
}

export function parseRawSkillMd(content: string, sourcePath: string): RawSkillMd {
  // Extract YAML frontmatter between --- delimiters
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    throw new Error(`No YAML frontmatter found in ${sourcePath}`);
  }

  const fmRaw = fmMatch[1]!;
  const body = content.slice(fmMatch[0].length).trim();

  // Simple YAML parser for flat and shallow-nested structures
  // (avoids external YAML library dependency)
  const frontmatter = parseSimpleYaml(fmRaw) as unknown as RawFrontmatter;

  // Parse sections from markdown body
  const sections = parseSections(body);

  return { frontmatter, body, sections, sourcePath };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: unknown[] = [];
  let currentObj: Record<string, unknown> = {};
  let inArray = false;
  let inObj = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top-level key: value (must start at column 0)
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous array of objects before starting new key
      if (inObj && inArray && currentKey && Object.keys(currentObj).length > 0) {
        currentArray.push({...currentObj});
        currentObj = {};
        inObj = false;
      }
      // Flush previous flat array before starting new key
      if (inArray && currentKey && !inObj) {
        result[currentKey] = [...currentArray];
        currentArray = [];
        inArray = false;
      }

      const key = kvMatch[1]!;
      const val = kvMatch[2]!.trim();

      if (val === '') {
        currentKey = key;
        result[key] = {};
        inArray = false;
        inObj = false;
        currentArray = [];
        currentObj = {};
      } else {
        currentKey = null;
        result[key] = parseYamlValue(val);
      }
      continue;
    }

    // Array item: - value or - key: value
    const arrMatch = trimmed.match(/^-\s+(.*)$/);
    if (arrMatch && currentKey) {
      // Flush previous object in array before starting a new item
      if (inObj && Object.keys(currentObj).length > 0) {
        currentArray.push({...currentObj});
        currentObj = {};
      }
      inArray = true;
      const itemVal = arrMatch[1]!.trim();

      // Check for inline key: value
      const inlineKv = itemVal.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (inlineKv) {
        inObj = true;
        currentObj[inlineKv[1]!] = parseYamlValue(inlineKv[2]!.trim());
      } else {
        currentArray.push(parseYamlValue(itemVal));
      }
      continue;
    }

    // Nested key: value inside object (indented, not at column 0)
    const nestedKv = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (nestedKv && currentKey) {
      const nKey = nestedKv[1]!;
      const nVal = nestedKv[2]!.trim();

      if (nVal === '') {
        // deeper nested object key — start tracking sub-key for array of objects
        inObj = true;
      } else if (inObj && inArray) {
        // Inside an object in an array — add to current object
        currentObj[nKey] = parseYamlValue(nVal);
      } else {
        // Direct nested key under a top-level key
        // Check for inline object {}
        const objMatch = nVal.match(/^\{(.*)\}$/);
        if (objMatch) {
          const innerPairs = objMatch[1]!.split(',').map(s => s.trim());
          const innerObj: Record<string, unknown> = {};
          for (const pair of innerPairs) {
            const [ik, iv] = pair.split(':').map(s => s.trim().replace(/"/g, ''));
            if (ik && iv) innerObj[ik] = parseYamlValue(iv);
          }
          (result[currentKey] as Record<string,unknown>)[nKey] = innerObj;
        } else {
          (result[currentKey] as Record<string,unknown>)[nKey] = parseYamlValue(nVal);
        }
      }
    }
  }

  // Final flush
  if (inObj && inArray && currentKey && Object.keys(currentObj).length > 0) {
    currentArray.push({...currentObj});
  }
  if (inArray && currentKey) {
    result[currentKey] = [...currentArray];
  }

  return result;
}

function parseYamlValue(val: string): unknown {
  const trimmed = val.trim();
  // Remove surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Null
  if (trimmed === 'null' || trimmed === '~') return null;
  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;
  // Array shorthand [a, b, c]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map(s => parseYamlValue(s.trim()));
  }
  return trimmed;
}

function parseSections(body: string): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const lines = body.split('\n');
  let currentSection: SectionInfo | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      // Flush previous
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }
      currentSection = {
        level: hMatch[1]!.length,
        title: hMatch[2]!.trim(),
        content: '',
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
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

  // Security level
  const securityLevel: SecurityLevel =
    fm.security_level && VALID_SECURITY_LEVELS.has(fm.security_level)
      ? (fm.security_level as SecurityLevel)
      : 'medium';

  // Permissions
  const permissions: Permission[] = (fm.permissions || []).map(p => {
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
  if (fm.capability_tiers) {
    for (const [tier, cfg] of Object.entries(fm.capability_tiers)) {
      capabilityTiers.push({
        tier: tier as CapabilityTier['tier'],
        min_score: cfg.min_capability_score,
        adaptation: cfg.adaptation as CapabilityTier['adaptation'],
      });
    }
  }

  // Platform activation
  const platformActivation: Record<string, PlatformActivation> = {};
  if (fm.platform_activation) {
    for (const [plat, cfg] of Object.entries(fm.platform_activation)) {
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
    version: fm.version || '0.1.0',
    description: fm.description as string,
    mcp_servers: fm.mcp_servers || [],
    security_level: securityLevel,
    hitl_required: fm.hitl_required ?? false,
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
