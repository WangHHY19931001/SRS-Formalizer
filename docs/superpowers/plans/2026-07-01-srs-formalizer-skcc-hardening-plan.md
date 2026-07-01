# srs-formalizer v0.4.0 SkCC Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate SkCC compilation methodology into srs-formalizer — add `compile` command with SkIR intermediate representation, Anti-Skill safety injection (7 rules, 3 severity levels), and dual-target emission (Claude XML + Generic Markdown).

**Architecture:** New `compile` CLI command implements a four-phase compilation pipeline (Parse → IR Build → Inject → Emit). All new types live in `scripts/types/skir.ts`. Three pure-logic libraries (anti-skill, skir-builder, compile-validator) feed into two emitters (claude-xml, generic-md), orchestrated by `compile.ts`. Zero modifications to existing pipeline infrastructure except +2 lines in `index.ts` and +8 lines in `orchestrator_stage_S1.md`.

**Tech Stack:** TypeScript 5.5+ (strict), Node.js ≥20, ESM, zero external dependencies beyond `typescript` + `@types/node`. Test runner: `npx tsx --test`.

## Global Constraints

- TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
- Zero external npm dependencies (only `typescript` + `@types/node`)
- All file operations limited to `.srs_formalizer/` working directory
- CLI commands return `CliResult` JSON (`{status: 'ok'|'error', message?: string, data?: unknown}`)
- Code follows existing patterns: `parseArg(args, name)` for CLI, async `main(args): Promise<CliResult>` entry, dynamic `import('./commands/xxx.js')` in index.ts
- Tests use `npx tsx --test` with `node:test` + `node:assert`
- TDD: write failing tests first, verify RED, implement, verify GREEN, commit

---

### Task 1: SkIR Type Definitions

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/types/skir.ts`

**Interfaces:**
- Produces: `SkillIR`, `ProcedureStep`, `Permission`, `PermissionKind`, `Constraint`, `ConstraintLevel`, `ConstraintScope`, `PipelineStage`, `CapabilityTier`, `PlatformActivation`, `SecurityLevel`, `SkillMode`, `Approach`, `Example`, `SectionInfo`, `CheckResult` — exported interfaces consumed by all subsequent tasks

- [ ] **Step 1: Create the SkIR types file**

```typescript
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
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: PASS (no errors from new types file)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/types/skir.ts
git commit -m "feat(skir): add SkIR type definitions for intermediate representation

30+ typed fields across 9 groups, aligning with SkCC (arXiv:2605.03353) skill_ir.rs
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Anti-Skill Injector

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/lib/anti-skill.ts`
- Create: `.claude/skills/srs-formalizer/scripts/__tests__/anti-skill.test.ts`

**Interfaces:**
- Consumes: `SkillIR`, `Constraint`, `ConstraintLevel`, `ProcedureStep` from `types/skir.ts`
- Produces: `AntiPattern`, `inject(skillIR: SkillIR): SkillIR`, `getViolationsByLevel(ir: SkillIR, level: ConstraintLevel): Constraint[]`

- [ ] **Step 1: Write failing tests**

```typescript
// .claude/skills/srs-formalizer/scripts/__tests__/anti-skill.test.ts
import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { inject, getViolationsByLevel } from '../lib/anti-skill.js';
import type { SkillIR, ProcedureStep } from '../types/skir.js';

function makeIR(procedures: ProcedureStep[]): SkillIR {
  return {
    name: 'test-skill', version: '1.0.0', description: 'Test',
    mcp_servers: [], security_level: 'medium', hitl_required: false,
    pre_conditions: [], post_conditions: [], fallbacks: [],
    permissions: [], context_gathering: [], procedures,
    approaches: [], mode: 'sequential', few_shot_examples: [],
    anti_skill_constraints: [], extra_sections: [],
    requires_yaml_optimization: false,
    pipeline_stages: [], capability_requirements: {},
    capability_tiers: [], platform_activation: {},
    stage_gates: [], source_path: '', source_hash: '', compiled_at: '',
  };
}

function makeStep(order: number, instruction: string): ProcedureStep {
  return { order, instruction, is_critical: false, constraints: [],
           expected_output: undefined, on_error: undefined };
}

describe('AntiSkillInjector', () => {
  it('injects HTTP safety constraint when procedure contains fetch', () => {
    const ir = makeIR([makeStep(1, 'fetch data from API')]);
    const result = inject(ir);
    const httpConstraint = result.anti_skill_constraints.find(
      c => c.source === 'anti-skill-injector' && c.content.includes('timeout')
    );
    strictEqual(httpConstraint !== undefined, true);
    strictEqual(httpConstraint!.level, 'warning');
  });

  it('injects loop safety constraint when procedure contains while', () => {
    const ir = makeIR([makeStep(1, 'while processing records')]);
    const result = inject(ir);
    const loopConstraint = result.anti_skill_constraints.find(
      c => c.content.includes('iteration limit')
    );
    strictEqual(loopConstraint !== undefined, true);
    strictEqual(loopConstraint!.level, 'error');
  });

  it('injects DB destructive constraint when procedure contains DROP', () => {
    const ir = makeIR([makeStep(1, 'DROP TABLE users')]);
    const result = inject(ir);
    const dbConstraint = result.anti_skill_constraints.find(
      c => c.content.includes('destructive')
    );
    strictEqual(dbConstraint !== undefined, true);
    strictEqual(dbConstraint!.level, 'critical');
  });

  it('injects parse safety constraint for BeautifulSoup', () => {
    const ir = makeIR([makeStep(1, 'use BeautifulSoup to parse HTML')]);
    const result = inject(ir);
    const parseConstraint = result.anti_skill_constraints.find(
      c => c.content.includes('Fallback to Regex')
    );
    strictEqual(parseConstraint !== undefined, true);
    strictEqual(parseConstraint!.level, 'warning');
  });

  it('injects SRS writeback constraint for SRS_PATCHES.md', () => {
    const ir = makeIR([makeStep(1, 'write findings to SRS_PATCHES.md')]);
    const result = inject(ir);
    const srsConstraint = result.anti_skill_constraints.find(
      c => c.content.includes('NEVER modify original SRS')
    );
    strictEqual(srsConstraint !== undefined, true);
    strictEqual(srsConstraint!.level, 'critical');
  });

  it('injects verifier isolation constraint for executor-R dispatch', () => {
    const ir = makeIR([makeStep(1, 'dispatch subagent with executor-R1')]);
    const result = inject(ir);
    const isoConstraint = result.anti_skill_constraints.find(
      c => c.content.includes('FRESH session')
    );
    strictEqual(isoConstraint !== undefined, true);
    strictEqual(isoConstraint!.level, 'error');
  });

  it('injects integrity gate constraint for stage transition', () => {
    const ir = makeIR([makeStep(1, 'verify-gate before stage transition')]);
    const result = inject(ir);
    const integrityConstraint = result.anti_skill_constraints.find(
      c => c.content.includes('verify-skill-integrity')
    );
    strictEqual(integrityConstraint !== undefined, true);
    strictEqual(integrityConstraint!.level, 'critical');
  });

  it('does not inject constraints for safe procedures', () => {
    const ir = makeIR([makeStep(1, 'read and display data safely')]);
    const result = inject(ir);
    strictEqual(result.anti_skill_constraints.length, 0);
  });

  it('injects multiple constraints when multiple keywords match', () => {
    const ir = makeIR([makeStep(1, 'HTTP DROP while')]);
    const result = inject(ir);
    strictEqual(result.anti_skill_constraints.length >= 3, true);
  });

  it('preserves existing fields after injection', () => {
    const ir = makeIR([makeStep(1, 'HTTP request with DROP')]);
    ir.hitl_required = true;
    ir.security_level = 'high';
    const result = inject(ir);
    strictEqual(result.name, 'test-skill');
    strictEqual(result.hitl_required, true);
    strictEqual(result.security_level, 'high');
  });

  it('getViolationsByLevel filters correctly', () => {
    const ir = makeIR([makeStep(1, 'HTTP fetch while DROP')]);
    const injected = inject(ir);
    const criticals = getViolationsByLevel(injected, 'critical');
    const errors = getViolationsByLevel(injected, 'error');
    const warnings = getViolationsByLevel(injected, 'warning');
    strictEqual(criticals.length >= 1, true);
    strictEqual(errors.length >= 1, true);
    strictEqual(warnings.length >= 1, true);
  });

  it('empty procedures produce no constraints', () => {
    const ir = makeIR([]);
    const result = inject(ir);
    strictEqual(result.anti_skill_constraints.length, 0);
  });
});
```

- [ ] **Step 2: Run tests — verify RED**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/anti-skill.test.ts
```
Expected: all 11 tests FAIL with "Cannot find module '../lib/anti-skill.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// .claude/skills/srs-formalizer/scripts/lib/anti-skill.ts
// Anti-Skill Injector — compile-time safety constraint injection
// 对标 SkCC nexa-skill-core/src/analyzer/anti_skill.rs

import type { SkillIR, Constraint, ConstraintLevel } from '../types/skir.js';

export interface AntiPattern {
  id: string;
  trigger_keywords: string[];
  constraint_content: string;
  level: ConstraintLevel;
}

const RULES_SKCC_DEFAULT: AntiPattern[] = [
  {
    id: 'http-safety',
    trigger_keywords: ['HTTP', 'GET', 'POST', 'fetch', 'request', 'curl', 'wget'],
    constraint_content:
      'NEVER execute HTTP without timeout (10s). Max 3 retries on 403.',
    level: 'warning',
  },
  {
    id: 'loop-safety',
    trigger_keywords: ['while', 'loop', 'repeat', 'for ('],
    constraint_content:
      'ALL loops must have max iteration limit (1000). Implement counter + break condition.',
    level: 'error',
  },
  {
    id: 'db-destructive-safety',
    trigger_keywords: ['DROP', 'DELETE', 'TRUNCATE', 'rm -rf'],
    constraint_content:
      'NO destructive DB/FS operations without user confirmation. Show affected rows/files first.',
    level: 'critical',
  },
  {
    id: 'parse-safety',
    trigger_keywords: ['BeautifulSoup', 'HTML parse', 'innerHTML', 'eval('],
    constraint_content:
      'Do NOT parse raw JS variables with HTML parsers. Fallback to Regex.',
    level: 'warning',
  },
];

const RULES_SRS_SPECIFIC: AntiPattern[] = [
  {
    id: 'srs-writeback-safety',
    trigger_keywords: ['SRS_PATCHES.md', 'write to SRS', '修改原始SRS', 'writeFileSync', 'fs.write'],
    constraint_content:
      'NEVER modify original SRS file without user explicit confirmation. ' +
      'All writes MUST be limited to .srs_formalizer/ directory.',
    level: 'critical',
  },
  {
    id: 'verifier-isolation',
    trigger_keywords: ['verifier-R', 'executor-R', 'dispatch subagent', 'new session', '上下文隔离'],
    constraint_content:
      'Verifiers MUST execute in FRESH session. Executor output MUST NOT ' +
      'influence verifier judgment. Cross-contamination = automatic REJECTED.',
    level: 'error',
  },
  {
    id: 'integrity-gate-mandatory',
    trigger_keywords: ['stage transition', 'stage complete', 'pipeline', 'verify-gate'],
    constraint_content:
      'MUST run verify-skill-integrity BEFORE every stage transition. ' +
      'Tampering detected → auto-repair from .enc → BLOCK pipeline → notify human.',
    level: 'critical',
  },
];

const ALL_RULES: AntiPattern[] = [...RULES_SKCC_DEFAULT, ...RULES_SRS_SPECIFIC];

export function inject(skillIR: SkillIR): SkillIR {
  const allText = skillIR.procedures
    .map(p => p.instruction)
    .join(' ');

  const constraints: Constraint[] = [...skillIR.anti_skill_constraints];

  for (const rule of ALL_RULES) {
    const matched = rule.trigger_keywords.some(kw => allText.includes(kw));
    if (matched) {
      constraints.push({
        source: 'anti-skill-injector',
        content: rule.constraint_content,
        level: rule.level,
        scope: { type: 'global' },
      });
    }
  }

  return { ...skillIR, anti_skill_constraints: constraints };
}

export function getViolationsByLevel(
  ir: SkillIR,
  level: ConstraintLevel,
): Constraint[] {
  return ir.anti_skill_constraints.filter(c => c.level === level);
}
```

- [ ] **Step 4: Run tests — verify GREEN**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/anti-skill.test.ts
```
Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/anti-skill.ts .claude/skills/srs-formalizer/scripts/__tests__/anti-skill.test.ts
git commit -m "feat(anti-skill): add compile-time safety constraint injector

7 rules (4 from SkCC + 3 srs-formalizer specific), 3 severity levels
(warning/error/critical), keyword-based pattern matching on procedure text.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: SkIR Builder

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/lib/skir-builder.ts`
- Create: `.claude/skills/srs-formalizer/scripts/__tests__/skir-builder.test.ts`

**Interfaces:**
- Consumes: `SkillIR`, `PipelineStage`, `ProcedureStep`, `Permission`, `CapabilityTier`, `PlatformActivation`, `SecurityLevel`, `SkillMode` from `types/skir.ts`; reads `SKILL.md` (YAML frontmatter + Markdown body)
- Produces: `parseRawSkillMd(content: string, sourcePath: string): RawSkillMd`, `buildSkIR(raw: RawSkillMd): SkillIR`, `RawSkillMd { frontmatter: Record<string,unknown>, body: string, sections: SectionInfo[] }`

- [ ] **Step 1: Write failing tests**

```typescript
// .claude/skills/srs-formalizer/scripts/__tests__/skir-builder.test.ts
import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { parseRawSkillMd, buildSkIR } from '../lib/skir-builder.js';

const MINIMAL_SKILL = `---
name: test-skill
description: A test skill
version: "1.0.0"
---
# Test Skill
This is the body.`;

const FULL_SKILL = `---
name: srs-formalizer
description: SRS formalization skill
version: "0.3.0"
compatibility: requires Node.js≥20
security_level: high
hitl_required: true
mcp_servers:
  - filesystem-server
  - fetch
permissions:
  - kind: filesystem
    scope: ".srs_formalizer/*"
    read_only: false
  - kind: network
    scope: "https://api.search.brave.com/*"
    read_only: true
metadata:
  pipeline_stages: [S0-discovery, S1-preprocess, S2-extract, S3-graph, S4-bdd, S5-formal, S6-gate]
  stage_gates: [validate-jsonl, validate-architecture, validate-cypher, validate-bdd, verify-gate]
capability_tiers:
  strong:  { min_capability_score: 80, adaptation: "full_auto" }
  medium:  { min_capability_score: 50, adaptation: "guided" }
  weak:    { min_capability_score: 0,  adaptation: "human_in_loop" }
platform_activation:
  claude-code: { hook: UserPromptSubmit, forced_eval: true }
  cursor: { rule_type: glob_attached, always_apply: false }
  trae: { rule_type: always_on }
  opencode: { rule_type: always_apply }
---
# SRS Formalizer

## Procedures
1. S0 Discovery: scan SRS, detect triggers
2. S1 Preprocess: init + manifest
3. S2 Extract: R1→Arch1→R2→Arch2→R3-1→Arch3→R3-2
`;

describe('SkIR Builder', () => {
  it('parses minimal SKILL.md frontmatter', () => {
    const raw = parseRawSkillMd(MINIMAL_SKILL, 'test.md');
    strictEqual(raw.frontmatter.name, 'test-skill');
    strictEqual(raw.frontmatter.description, 'A test skill');
    strictEqual(raw.frontmatter.version, '1.0.0');
  });

  it('builds SkIR from minimal SKILL.md', () => {
    const raw = parseRawSkillMd(MINIMAL_SKILL, 'test.md');
    const ir = buildSkIR(raw);
    strictEqual(ir.name, 'test-skill');
    strictEqual(ir.version, '1.0.0');
    strictEqual(ir.description, 'A test skill');
    strictEqual(ir.security_level, 'medium');
    strictEqual(ir.hitl_required, false);
    strictEqual(ir.mode, 'sequential');
    ok(ir.source_path.endsWith('test.md'));
    strictEqual(ir.source_hash.length, 64);
    ok(ir.compiled_at.length > 0);
  });

  it('maps security_level from frontmatter', () => {
    const raw = parseRawSkillMd(FULL_SKILL, 'full.md');
    const ir = buildSkIR(raw);
    strictEqual(ir.security_level, 'high');
    strictEqual(ir.hitl_required, true);
  });

  it('maps permissions from frontmatter', () => {
    const raw = parseRawSkillMd(FULL_SKILL, 'full.md');
    const ir = buildSkIR(raw);
    strictEqual(ir.permissions.length, 2);
    strictEqual(ir.permissions[0]!.kind, 'filesystem');
    strictEqual(ir.permissions[0]!.scope, '.srs_formalizer/*');
    strictEqual(ir.permissions[0]!.read_only, false);
    strictEqual(ir.permissions[1]!.kind, 'network');
    strictEqual(ir.permissions[1]!.read_only, true);
  });

  it('maps MCP servers from frontmatter', () => {
    const raw = parseRawSkillMd(FULL_SKILL, 'full.md');
    const ir = buildSkIR(raw);
    strictEqual(ir.mcp_servers.length, 2);
    ok(ir.mcp_servers.includes('filesystem-server'));
    ok(ir.mcp_servers.includes('fetch'));
  });

  it('maps pipeline_stages from metadata', () => {
    const raw = parseRawSkillMd(FULL_SKILL, 'full.md');
    const ir = buildSkIR(raw);
    strictEqual(ir.pipeline_stages.length, 7);
    ok(ir.pipeline_stages.some((s: { id: string }) => s.id === 'S2'));
  });

  it('maps platform_activation', () => {
    const raw = parseRawSkillMd(FULL_SKILL, 'full.md');
    const ir = buildSkIR(raw);
    ok('claude-code' in ir.platform_activation);
    ok('trae' in ir.platform_activation);
    ok('opencode' in ir.platform_activation);
    strictEqual(ir.platform_activation['claude-code']!.hook, 'UserPromptSubmit');
  });

  it('builds procedures from body sections', () => {
    const raw = parseRawSkillMd(FULL_SKILL, 'full.md');
    const ir = buildSkIR(raw);
    ok(ir.procedures.length > 0);
    ok(ir.procedures.some((p: { instruction: string }) => p.instruction.includes('S0')));
  });

  it('rejects empty name', () => {
    const raw = parseRawSkillMd(`---
name: ""
description: test
---\n# Test`, 'empty.md');
    try {
      buildSkIR(raw);
      strictEqual(true, false, 'Should have thrown');
    } catch (e) {
      ok((e as Error).message.includes('name'));
    }
  });

  it('rejects non-kebab-case name', () => {
    const raw = parseRawSkillMd(`---
name: "Bad Name!"
description: test
---\n# Test`, 'bad.md');
    try {
      buildSkIR(raw);
      strictEqual(true, false, 'Should have thrown');
    } catch (e) {
      ok((e as Error).message.includes('kebab-case'));
    }
  });

  it('rejects description over 1024 chars', () => {
    const long = 'x'.repeat(1025);
    const raw = parseRawSkillMd(`---
name: test-skill
description: "${long}"
---\n# Test`, 'long.md');
    try {
      buildSkIR(raw);
      strictEqual(true, false, 'Should have thrown');
    } catch (e) {
      ok((e as Error).message.includes('description'));
    }
  });
});
```

- [ ] **Step 2: Run tests — verify RED**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/skir-builder.test.ts
```
Expected: all tests FAIL

- [ ] **Step 3: Write implementation**

```typescript
// .claude/skills/srs-formalizer/scripts/lib/skir-builder.ts
// SkIR Builder — RawAST → SkillIR transformation
// 对标 SkCC nexa-skill-core/src/ir/builder.rs

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
const VALID_PERMISSION_KINDS = new Set([
  'network', 'filesystem', 'database', 'execute', 'mcp', 'environment',
  'fs', 'db', 'exec',
]);

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
  const frontmatter = parseSimpleYaml(fmRaw) as RawFrontmatter;

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
  let objKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top-level key: value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kvMatch && !trimmed.startsWith(' ') && !trimmed.startsWith('\t')) {
      // Flush previous
      if (inArray && currentKey) {
        result[currentKey] = [...currentArray];
        currentArray = [];
        inArray = false;
      }
      if (inObj && objKey && currentKey) {
        (result[currentKey] as Record<string,unknown>)[objKey] = {...currentObj};
        currentObj = {};
        inObj = false;
      }

      const key = kvMatch[1]!;
      const val = kvMatch[2]!.trim();

      if (val === '') {
        // Might be a nested object or array starting on next line
        currentKey = key;
        // Initialize object placeholder
        result[key] = {};
      } else {
        currentKey = null;
        result[key] = parseYamlValue(val);
      }
      continue;
    }

    // Array item: - value or - key: value
    const arrMatch = trimmed.match(/^-\s+(.*)$/);
    if (arrMatch && currentKey) {
      inArray = true;
      const itemVal = arrMatch[1]!.trim();

      // Check for inline key: value
      const inlineKv = itemVal.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (inlineKv) {
        if (!inObj) {
          // Convert previous array to object array
          if (currentArray.length > 0) {
            // already started as flat array, keep as is
          }
          inObj = true;
          objKey = currentKey;
          currentObj[inlineKv[1]!] = parseYamlValue(inlineKv[2]!.trim());
        }
      } else {
        currentArray.push(parseYamlValue(itemVal));
      }
      continue;
    }

    // Nested key: value inside object
    const nestedKv = trimmed.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (nestedKv && currentKey) {
      const nKey = nestedKv[1]!;
      const nVal = nestedKv[2]!.trim();

      if (nVal === '') {
        // deeper nested object
        objKey = nKey;
        inObj = true;
      } else {
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

  // Flush pending
  if (inArray && currentKey) {
    if (inObj && objKey) {
      // We were building objects, not flat array
    } else {
      result[currentKey] = [...currentArray];
    }
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
    throw new Error(`Description too long: ${fm.description.length} characters (max 1024)`);
  }

  // Security level
  const securityLevel: SecurityLevel =
    fm.security_level && VALID_SECURITY_LEVELS.has(fm.security_level)
      ? (fm.security_level as SecurityLevel)
      : 'medium';

  // Permissions
  const permissions: Permission[] = (fm.permissions || []).map(p => ({
    kind: normalizePermissionKind(p.kind) as Permission['kind'],
    scope: p.scope,
    description: p.description,
    read_only: p.read_only ?? false,
  }));

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
      platformActivation[plat] = {
        hook: cfg.hook as string | undefined,
        forced_eval: cfg.forced_eval as boolean | undefined,
        rule_type: cfg.rule_type as string | undefined,
        always_apply: cfg.always_apply as boolean | undefined,
      };
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

  return {
    name: fm.name,
    version: fm.version || '0.1.0',
    description: fm.description,
    mcp_servers: fm.mcp_servers || [],
    input_schema: fm.input_schema,
    output_schema: fm.output_schema,
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
    nested_data_depth: undefined,
    pipeline_stages: pipelineStages,
    capability_requirements: fm.metadata?.capability_requirements as Record<string, Record<string, number>> || {},
    capability_tiers: capabilityTiers,
    platform_activation: platformActivation,
    stage_gates: stageGates,
    source_path: raw.sourcePath,
    source_hash: sourceHash,
    compiled_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run tests — verify GREEN**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/skir-builder.test.ts
```
Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/skir-builder.ts .claude/skills/srs-formalizer/scripts/__tests__/skir-builder.test.ts
git commit -m "feat(skir-builder): add SkIR construction from SKILL.md

Parse YAML frontmatter + Markdown body → buildSkIR() → validated SkIR.
Validates name (kebab-case), description (max 1024), security_level enum.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Compile Validator

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/lib/compile-validator.ts`

**Interfaces:**
- Consumes: `SkillIR`, `CheckResult` from `types/skir.ts`
- Produces: `validateSkIR(ir: SkillIR): CheckResult[]`, `hasBlockingViolations(checks: CheckResult[]): boolean`

- [ ] **Step 1: Write the implementation**

```typescript
// .claude/skills/srs-formalizer/scripts/lib/compile-validator.ts
// Compile-time SkIR Schema Validation
// 对标 SkCC nexa-skill-core/src/analyzer/schema.rs

import type { SkillIR, CheckResult, ConstraintLevel } from '../types/skir.js';

const VALID_SECURITY_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const VALID_MODES = new Set(['sequential', 'alternative', 'toolkit', 'guideline']);
const VALID_PERMISSION_KINDS = new Set([
  'network', 'filesystem', 'database', 'execute', 'mcp', 'environment',
]);

export function validateSkIR(ir: SkillIR): CheckResult[] {
  const checks: CheckResult[] = [];

  // Name: required, kebab-case, 1-64 chars
  const nameRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!ir.name || ir.name.trim() === '') {
    checks.push({ name: 'name required', passed: false, detail: 'name is empty' });
  } else if (ir.name.length > 64) {
    checks.push({ name: 'name length', passed: false, detail: `name "${ir.name}" exceeds 64 chars` });
  } else if (!nameRe.test(ir.name)) {
    checks.push({ name: 'name format', passed: false, detail: `name "${ir.name}" is not kebab-case` });
  } else {
    checks.push({ name: 'name valid', passed: true, detail: ir.name });
  }

  // Description: required, max 1024
  if (!ir.description || ir.description.trim() === '') {
    checks.push({ name: 'description required', passed: false, detail: 'description is empty' });
  } else if (ir.description.length > 1024) {
    checks.push({ name: 'description length', passed: false, detail: `${ir.description.length} chars (max 1024)` });
  } else {
    checks.push({ name: 'description valid', passed: true, detail: `${ir.description.length} chars` });
  }

  // Security level
  if (!VALID_SECURITY_LEVELS.has(ir.security_level)) {
    checks.push({ name: 'security_level', passed: false, detail: `invalid: "${ir.security_level}"` });
  } else {
    checks.push({ name: 'security_level', passed: true, detail: ir.security_level });
  }

  // HITL consistency
  if (ir.hitl_required && ir.security_level === 'low') {
    checks.push({
      name: 'HITL consistency',
      passed: false,
      detail: 'hitl_required=true but security_level=low — inconsistent',
    });
  } else {
    checks.push({ name: 'HITL consistency', passed: true, detail: 'ok' });
  }

  // Mode
  if (!VALID_MODES.has(ir.mode)) {
    checks.push({ name: 'mode', passed: false, detail: `invalid: "${ir.mode}"` });
  } else {
    checks.push({ name: 'mode', passed: true, detail: ir.mode });
  }

  // Permissions
  let permOk = true;
  const permErrors: string[] = [];
  for (let i = 0; i < ir.permissions.length; i++) {
    const p = ir.permissions[i]!;
    if (!VALID_PERMISSION_KINDS.has(p.kind)) {
      permOk = false;
      permErrors.push(`permissions[${i}]: invalid kind "${p.kind}"`);
    }
    if (!p.scope || p.scope.trim() === '') {
      permOk = false;
      permErrors.push(`permissions[${i}]: empty scope`);
    }
  }
  checks.push({
    name: 'permissions',
    passed: permOk,
    detail: permOk ? `${ir.permissions.length} permission(s)` : permErrors.join('; '),
  });

  // Anti-skill constraints: error/critical are blocking
  const violations = ir.anti_skill_constraints.filter(
    c => c.level === 'error' || c.level === 'critical',
  );
  if (violations.length > 0) {
    const details = violations.map(v => `[${v.level}] ${v.content.slice(0, 80)}`);
    checks.push({
      name: 'anti-skill violations',
      passed: false,
      detail: `${violations.length} blocking violation(s): ${details.join('; ')}`,
    });
  } else {
    checks.push({
      name: 'anti-skill violations',
      passed: true,
      detail: `0 blocking (${ir.anti_skill_constraints.filter(c => c.level === 'warning').length} warning(s))`,
    });
  }

  // Source hash
  if (!ir.source_hash || ir.source_hash.length !== 64) {
    checks.push({ name: 'source_hash', passed: false, detail: `invalid hash: "${ir.source_hash}"` });
  } else {
    checks.push({ name: 'source_hash', passed: true, detail: ir.source_hash.slice(0, 12) + '...' });
  }

  return checks;
}

export function hasBlockingViolations(checks: CheckResult[]): boolean {
  return checks.some(c => !c.passed);
}

export function getBlockingLevel(ir: SkillIR): ConstraintLevel | null {
  const levels: ConstraintLevel[] = ['critical', 'error', 'warning'];
  for (const level of levels) {
    if (ir.anti_skill_constraints.some(c => c.level === level)) {
      return level;
    }
  }
  return null;
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/compile-validator.ts
git commit -m "feat(compile-validator): add SkIR schema validation

9 checks: name, description, security_level, HITL consistency, mode,
permissions, anti-skill violations, source_hash. Blocking detection.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Claude XML Emitter

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/lib/emitter-claude-xml.ts`

**Interfaces:**
- Consumes: `SkillIR`, `ProcedureStep`, `Constraint`, `Permission`, `Example`, `SectionInfo` from `types/skir.ts`
- Produces: `ClaudeXmlEmitter`, `emit(skir: SkillIR): string`

- [ ] **Step 1: Write the implementation**

```typescript
// .claude/skills/srs-formalizer/scripts/lib/emitter-claude-xml.ts
// Claude XML Emitter — SkIR → XML Semantic Layering
// 对标 SkCC nexa-skill-templates/templates/claude_xml.j2
// 学术依据: Claude +23% reasoning accuracy with XML tags (SkCC Section 3.3)

import type { SkillIR, Constraint, Permission, Example, SectionInfo } from '../types/skir.js';

export class ClaudeXmlEmitter {
  emit(ir: SkillIR): string {
    const lines: string[] = [];

    // YAML frontmatter (required for Claude Code skill discovery)
    lines.push('---');
    lines.push(`name: ${ir.name}`);
    lines.push(`description: ${this.escapeXml(ir.description)}`);
    lines.push('---');
    lines.push('');

    // Root
    lines.push('<agent_skill>');

    // Metadata block
    lines.push('  <metadata>');
    lines.push(`    <name>${this.escapeXml(ir.name)}</name>`);
    lines.push(`    <version>${ir.version}</version>`);
    lines.push(`    <security_level>${ir.security_level}</security_level>`);
    lines.push(`    <mode>${ir.mode}</mode>`);
    lines.push('  </metadata>');
    lines.push('');

    // Intent
    lines.push(`  <intent>${this.escapeXml(ir.description)}</intent>`);
    lines.push('');

    // System constraint (HITL)
    if (ir.hitl_required) {
      lines.push('  <system_constraint>');
      lines.push('    Human-In-The-Loop REQUIRED for execution.');
      lines.push('    This skill is marked as requiring human confirmation.');
      lines.push('  </system_constraint>');
      lines.push('');
    }

    // MCP Servers
    if (ir.mcp_servers.length > 0) {
      lines.push('  <mcp_servers>');
      for (const srv of ir.mcp_servers) {
        lines.push(`    <server>${this.escapeXml(srv)}</server>`);
      }
      lines.push('  </mcp_servers>');
      lines.push('');
    }

    // Pre-conditions
    if (ir.pre_conditions.length > 0) {
      lines.push('  <pre_conditions>');
      for (const cond of ir.pre_conditions) {
        lines.push(`    <condition>${this.escapeXml(cond)}</condition>`);
      }
      lines.push('  </pre_conditions>');
      lines.push('');
    }

    // Context gathering
    if (ir.context_gathering.length > 0) {
      lines.push('  <context_gathering>');
      for (const step of ir.context_gathering) {
        lines.push(`    <step>${this.escapeXml(step)}</step>`);
      }
      lines.push('  </context_gathering>');
      lines.push('');
    }

    // Execution steps
    if (ir.procedures.length > 0) {
      lines.push('  <execution_steps>');
      for (const step of ir.procedures) {
        const critical = step.is_critical ? ' critical="true"' : '';
        lines.push(`    <step order="${step.order}"${critical}>${this.escapeXml(step.instruction)}</step>`);
      }
      lines.push('  </execution_steps>');
      lines.push('');
    }

    // Approaches (for mode-selector skills)
    if (ir.approaches.length > 0) {
      lines.push(`  <execution_approaches mode="${ir.mode}">`);
      for (const app of ir.approaches) {
        lines.push(`    <approach name="${this.escapeXml(app.name)}">${this.escapeXml(app.description)}</approach>`);
      }
      lines.push('  </execution_approaches>');
      lines.push('');
    }

    // Strict constraints (Anti-Skill)
    if (ir.anti_skill_constraints.length > 0) {
      lines.push('  <strict_constraints>');
      for (const c of ir.anti_skill_constraints) {
        lines.push(`    <anti_pattern source="${c.source}" level="${c.level}">${this.escapeXml(c.content)}</anti_pattern>`);
      }
      lines.push('  </strict_constraints>');
      lines.push('');
    }

    // Permissions
    if (ir.permissions.length > 0) {
      lines.push('  <permissions>');
      for (const p of ir.permissions) {
        const desc = p.description ? ` ${this.escapeXml(p.description)}` : '';
        lines.push(`    <permission kind="${p.kind}" scope="${this.escapeXml(p.scope)}" read_only="${p.read_only}">${desc}</permission>`);
      }
      lines.push('  </permissions>');
      lines.push('');
    }

    // Examples
    if (ir.few_shot_examples.length > 0) {
      lines.push('  <examples>');
      for (const ex of ir.few_shot_examples) {
        const titleAttr = ex.title ? ` title="${this.escapeXml(ex.title)}"` : '';
        lines.push(`    <example${titleAttr}>`);
        lines.push(`      <input>${this.escapeXml(ex.user_input)}</input>`);
        lines.push(`      <output>${this.escapeXml(ex.agent_response)}</output>`);
        lines.push('    </example>');
      }
      lines.push('  </examples>');
      lines.push('');
    }

    // Fallbacks
    if (ir.fallbacks.length > 0) {
      lines.push('  <fallbacks>');
      for (const fb of ir.fallbacks) {
        lines.push(`    <strategy>${this.escapeXml(fb)}</strategy>`);
      }
      lines.push('  </fallbacks>');
      lines.push('');
    }

    // Post-conditions
    if (ir.post_conditions.length > 0) {
      lines.push('  <post_conditions>');
      for (const cond of ir.post_conditions) {
        lines.push(`    <condition>${this.escapeXml(cond)}</condition>`);
      }
      lines.push('  </post_conditions>');
      lines.push('');
    }

    // Extra sections
    if (ir.extra_sections.length > 0) {
      lines.push('  <additional_context>');
      for (const sec of ir.extra_sections) {
        lines.push(`    <section title="${this.escapeXml(sec.title)}">`);
        lines.push(sec.content);
        lines.push('    </section>');
      }
      lines.push('  </additional_context>');
      lines.push('');
    }

    lines.push('</agent_skill>');
    return lines.join('\n') + '\n';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/emitter-claude-xml.ts
git commit -m "feat(emitter): add Claude XML semantic layering emitter

Generates <agent_skill> with <execution_steps>, <strict_constraints>,
<permissions>, <examples> tags. Aligns with SkCC claude_xml.j2 template.
Academic basis: +23% reasoning accuracy with XML (arXiv:2605.03353).
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Generic Markdown Emitter

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/lib/emitter-generic-md.ts`

**Interfaces:**
- Consumes: `SkillIR` from `types/skir.ts`
- Produces: `GenericMarkdownEmitter`, `emit(skir: SkillIR): string`

- [ ] **Step 1: Write the implementation**

```typescript
// .claude/skills/srs-formalizer/scripts/lib/emitter-generic-md.ts
// Generic Markdown Emitter — SkIR → Standard Markdown
// 对标 SkCC kimi_md.j2 + gemini_md_v2.j2
// Covers: OpenCode, Cursor, Windsurf, Qoder, Codex, Gemini, Kimi, Antigravity

import type { SkillIR } from '../types/skir.js';

export class GenericMarkdownEmitter {
  emit(ir: SkillIR): string {
    const lines: string[] = [];

    // YAML frontmatter (required for cross-platform skill discovery)
    lines.push('---');
    lines.push(`name: ${ir.name}`);
    lines.push(`description: ${ir.description.slice(0, 200)}`);
    if (ir.version !== '0.1.0') {
      lines.push(`version: ${ir.version}`);
    }
    if (ir.mcp_servers.length > 0) {
      lines.push('mcp_servers:');
      for (const srv of ir.mcp_servers) {
        lines.push(`  - ${srv}`);
      }
    }
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# ${ir.name}`);
    lines.push('');
    lines.push(`**Version**: ${ir.version}`);
    lines.push(`**Security Level**: ${ir.security_level}`);
    lines.push('');

    // Description
    lines.push('## Description');
    lines.push('');
    lines.push(ir.description);
    lines.push('');

    // HITL notice
    if (ir.hitl_required) {
      lines.push('> **HITL REQUIRED**: This skill requires human approval before execution.');
      lines.push('');
    }

    // MCP
    if (ir.mcp_servers.length > 0) {
      lines.push('## MCP Dependencies');
      lines.push('');
      for (const srv of ir.mcp_servers) {
        lines.push(`- ${srv}`);
      }
      lines.push('');
    }

    // Permissions
    if (ir.permissions.length > 0) {
      lines.push('## Permissions');
      lines.push('');
      lines.push('| Kind | Scope | Read-Only | Description |');
      lines.push('|------|-------|-----------|-------------|');
      for (const p of ir.permissions) {
        lines.push(`| ${p.kind} | \`${p.scope}\` | ${p.read_only ? '✅' : '❌'} | ${p.description || '—'} |`);
      }
      lines.push('');
    }

    // Pre-conditions
    if (ir.pre_conditions.length > 0) {
      lines.push('## Pre-Conditions');
      lines.push('');
      for (const cond of ir.pre_conditions) {
        lines.push(`- ${cond}`);
      }
      lines.push('');
    }

    // Context gathering
    if (ir.context_gathering.length > 0) {
      lines.push('## Context Gathering');
      lines.push('');
      for (const item of ir.context_gathering) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }

    // Procedures
    if (ir.procedures.length > 0) {
      lines.push('## Procedures');
      lines.push('');
      for (const step of ir.procedures) {
        const critical = step.is_critical ? ' **[CRITICAL]**' : '';
        lines.push(`${step.order}. ${step.instruction}${critical}`);
      }
      lines.push('');
    }

    // Approaches
    if (ir.approaches.length > 0) {
      lines.push(`## Approaches (${ir.mode})`);
      lines.push('');
      for (const app of ir.approaches) {
        lines.push(`### ${app.name}`);
        lines.push('');
        lines.push(app.description);
        lines.push('');
        lines.push(app.instructions);
        lines.push('');
      }
    }

    // Safety constraints
    if (ir.anti_skill_constraints.length > 0) {
      lines.push('## Safety Constraints');
      lines.push('');
      for (const c of ir.anti_skill_constraints) {
        const marker = c.level === 'critical' ? '**[CRITICAL]** '
          : c.level === 'error' ? '**[ERROR]** '
          : '**[WARNING]** ';
        lines.push(`> ${marker}${c.content}`);
      }
      lines.push('');
    }

    // Fallbacks
    if (ir.fallbacks.length > 0) {
      lines.push('## Fallbacks');
      lines.push('');
      for (const fb of ir.fallbacks) {
        lines.push(`- ${fb}`);
      }
      lines.push('');
    }

    // Post-conditions
    if (ir.post_conditions.length > 0) {
      lines.push('## Post-Conditions');
      lines.push('');
      for (const cond of ir.post_conditions) {
        lines.push(`- ${cond}`);
      }
      lines.push('');
    }

    // Examples
    if (ir.few_shot_examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      for (const ex of ir.few_shot_examples) {
        if (ex.title) {
          lines.push(`### ${ex.title}`);
          lines.push('');
        }
        lines.push('**User**: ' + ex.user_input);
        lines.push('');
        lines.push('**Agent**:');
        lines.push(ex.agent_response);
        lines.push('');
      }
    }

    // Extra sections
    if (ir.extra_sections.length > 0) {
      for (const sec of ir.extra_sections) {
        const prefix = '#'.repeat(Math.min(sec.level + 1, 6));
        lines.push(`${prefix} ${sec.title}`);
        lines.push('');
        lines.push(sec.content);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/emitter-generic-md.ts
git commit -m "feat(emitter): add Generic Markdown emitter for cross-platform compatibility

Covers OpenCode, Cursor, Windsurf, Qoder, Codex, Gemini, Kimi, Antigravity.
Constraints rendered as blockquotes with level markers.
Aligns with SkCC kimi_md.j2 + gemini_md_v2.j2 templates.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Emitter Tests

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/__tests__/emitter.test.ts`

**Interfaces:**
- Consumes: `ClaudeXmlEmitter` from `lib/emitter-claude-xml.js`, `GenericMarkdownEmitter` from `lib/emitter-generic-md.js`, `SkillIR` from `types/skir.js`

- [ ] **Step 1: Write failing tests**

```typescript
// .claude/skills/srs-formalizer/scripts/__tests__/emitter.test.ts
import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import { ClaudeXmlEmitter } from '../lib/emitter-claude-xml.js';
import { GenericMarkdownEmitter } from '../lib/emitter-generic-md.js';
import type { SkillIR, ProcedureStep, Permission, Example } from '../types/skir.js';

function makeIR(overrides: Partial<SkillIR> = {}): SkillIR {
  return {
    name: 'test-skill', version: '1.0.0', description: 'Test description',
    mcp_servers: ['filesystem-server'], security_level: 'high',
    hitl_required: true, pre_conditions: ['Check deps'],
    post_conditions: ['Verify output'], fallbacks: ['Retry on failure'],
    permissions: [{ kind: 'filesystem', scope: '/tmp/*', read_only: true }],
    context_gathering: ['Read config'],
    procedures: [
      { order: 1, instruction: 'Do task', is_critical: true, constraints: [] },
      { order: 2, instruction: 'Verify result', is_critical: false, constraints: [] },
    ],
    approaches: [],
    mode: 'sequential',
    few_shot_examples: [
      { title: 'Example 1', user_input: 'input text', agent_response: 'output text', tags: [] },
    ],
    anti_skill_constraints: [
      { source: 'anti-skill-injector', content: 'No destructive ops', level: 'critical', scope: { type: 'global' } },
    ],
    extra_sections: [],
    requires_yaml_optimization: false,
    pipeline_stages: [], capability_requirements: {}, capability_tiers: [],
    platform_activation: {}, stage_gates: [],
    source_path: 'test.md', source_hash: 'a'.repeat(64), compiled_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ClaudeXmlEmitter', () => {
  const emitter = new ClaudeXmlEmitter();

  it('produces valid XML with YAML frontmatter', () => {
    const result = emitter.emit(makeIR());
    ok(result.startsWith('---'), 'Must start with YAML frontmatter');
    ok(result.includes('name: test-skill'));
    ok(result.includes('<agent_skill>'));
    ok(result.includes('</agent_skill>'));
  });

  it('contains execution_steps with critical attribute', () => {
    const result = emitter.emit(makeIR());
    ok(result.includes('<execution_steps>'));
    ok(result.includes('critical="true"'));
    ok(result.includes('order="1"'));
  });

  it('contains strict_constraints with anti_pattern', () => {
    const result = emitter.emit(makeIR());
    ok(result.includes('<strict_constraints>'));
    ok(result.includes('<anti_pattern'));
    ok(result.includes('No destructive ops'));
    ok(result.includes('level="critical"'));
  });

  it('contains permissions block', () => {
    const result = emitter.emit(makeIR());
    ok(result.includes('<permissions>'));
    ok(result.includes('kind="filesystem"'));
    ok(result.includes('read_only="true"'));
  });

  it('contains examples block', () => {
    const result = emitter.emit(makeIR());
    ok(result.includes('<examples>'));
    ok(result.includes('title="Example 1"'));
    ok(result.includes('<input>'));
    ok(result.includes('<output>'));
  });

  it('escapes XML special characters', () => {
    const ir = makeIR({ description: 'Use <tags> & "quotes"' });
    const result = emitter.emit(ir);
    ok(!result.includes('<tags>'));
    ok(result.includes('&lt;tags&gt;'));
    ok(result.includes('&amp;'));
    ok(result.includes('&quot;'));
  });

  it('omits optional blocks when empty', () => {
    const ir = makeIR({
      mcp_servers: [], pre_conditions: [], permissions: [],
      approaches: [], few_shot_examples: [], anti_skill_constraints: [],
      hitl_required: false,
    });
    const result = emitter.emit(ir);
    ok(!result.includes('<mcp_servers>'));
    ok(!result.includes('<strict_constraints>'));
    ok(!result.includes('<permissions>'));
    ok(!result.includes('<system_constraint>'));
  });
});

describe('GenericMarkdownEmitter', () => {
  const emitter = new GenericMarkdownEmitter();

  it('produces markdown with YAML frontmatter', () => {
    const result = emitter.emit(makeIR());
    ok(result.startsWith('---'));
    ok(result.includes('# test-skill'));
    ok(result.includes('## Description'));
    ok(result.includes('## Procedures'));
  });

  it('contains no XML tags', () => {
    const result = emitter.emit(makeIR());
    ok(!result.includes('<agent_skill>'));
    ok(!result.includes('<execution_steps>'));
    ok(!result.includes('<anti_pattern'));
  });

  it('renders constraints as blockquotes with level markers', () => {
    const result = emitter.emit(makeIR());
    ok(result.includes('## Safety Constraints'));
    ok(result.includes('> **[CRITICAL]**'));
    ok(result.includes('No destructive ops'));
  });

  it('renders permissions as markdown table', () => {
    const result = emitter.emit(makeIR());
    ok(result.includes('| Kind | Scope | Read-Only |'));
    ok(result.includes('| filesystem |'));
  });

  it('marks critical steps in procedures', () => {
    const result = emitter.emit(makeIR());
    ok(result.includes('**[CRITICAL]**'));
  });

  it('omits optional sections when empty', () => {
    const ir = makeIR({
      mcp_servers: [], permissions: [], anti_skill_constraints: [],
      fallbacks: [], few_shot_examples: [], hitl_required: false,
    });
    const result = emitter.emit(ir);
    ok(!result.includes('## MCP Dependencies'));
    ok(!result.includes('## Permissions'));
    ok(!result.includes('## Safety Constraints'));
    ok(!result.includes('## Fallbacks'));
    ok(!result.includes('HITL REQUIRED'));
  });
});
```

- [ ] **Step 2: Run tests — verify RED**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/emitter.test.ts
```
Expected: all tests FAIL (emitter modules exist but tests reference them)

- [ ] **Step 3: Run tests — verify GREEN**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/emitter.test.ts
```
Expected: all 14 tests PASS (emitters already written in Tasks 5-6)

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/__tests__/emitter.test.ts
git commit -m "test(emitter): add 14 tests for Claude XML and Generic MD emitters

Covers: XML structure, critical attributes, escaping, optional blocks,
markdown rendering, constraint level markers, permission tables.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Compile Command

**Files:**
- Create: `.claude/skills/srs-formalizer/scripts/commands/compile.ts`
- Create: `.claude/skills/srs-formalizer/scripts/__tests__/compile.test.ts`

**Interfaces:**
- Consumes: `parseRawSkillMd`, `buildSkIR` from `lib/skir-builder.js`, `inject` from `lib/anti-skill.js`, `validateSkIR`, `hasBlockingViolations` from `lib/compile-validator.js`, `ClaudeXmlEmitter` from `lib/emitter-claude-xml.js`, `GenericMarkdownEmitter` from `lib/emitter-generic-md.js`, `validateWorkDir` from `lib/security.js`, `CliResult` from `types/index.js`
- Produces: `main(args: string[]): Promise<CliResult>`

- [ ] **Step 1: Write failing tests**

```typescript
// .claude/skills/srs-formalizer/scripts/__tests__/compile.test.ts
import { describe, it, before, after } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { main } from '../commands/compile.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-test-'));
const SKILL_DIR = path.join(TMP, 'test-skill');
const WORKDIR = path.join(TMP, '.srs_formalizer');

function writeSkillMd(content: string): void {
  fs.mkdirSync(SKILL_DIR, { recursive: true });
  fs.writeFileSync(path.join(SKILL_DIR, 'SKILL.md'), content, 'utf-8');
}

before(() => {
  fs.mkdirSync(WORKDIR, { recursive: true });
  fs.mkdirSync(path.join(WORKDIR, '_ctx'), { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('compile command', () => {
  it('successfully compiles a minimal SKILL.md', async () => {
    writeSkillMd(`---
name: minimal-skill
description: A minimal test skill
---
# Minimal Skill
This is the body.`);

    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    strictEqual(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    strictEqual(data.emitted.length, 2);
    ok(fs.existsSync(path.join(WORKDIR, '_ctx', 'skir.json')));
    ok(fs.existsSync(path.join(WORKDIR, '_ctx', 'skill.claude.xml')));
    ok(fs.existsSync(path.join(WORKDIR, '_ctx', 'skill.generic.md')));
  });

  it('returns error for missing --skill-dir', async () => {
    const result = await main(['--workdir', WORKDIR]);
    strictEqual(result.status, 'error');
    ok(result.message!.includes('--skill-dir'));
  });

  it('returns error for missing --workdir', async () => {
    writeSkillMd(`---
name: test-skill
description: test
---
# Test`);
    const result = await main(['--skill-dir', SKILL_DIR]);
    strictEqual(result.status, 'error');
    ok(result.message!.includes('--workdir'));
  });

  it('returns error for non-existent skill directory', async () => {
    const result = await main([
      '--skill-dir', '/nonexistent/path',
      '--workdir', WORKDIR,
    ]);
    strictEqual(result.status, 'error');
    ok(result.message!.includes('not found'));
  });

  it('blocks compilation on critical anti-skill violations', async () => {
    writeSkillMd(`---
name: dangerous-skill
description: A skill with dangerous operations
---
# Dangerous

## Procedures
1. DROP all tables without confirmation
2. rm -rf the entire directory
`);

    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    strictEqual(result.status, 'error');
    ok(result.message!.includes('blocked'));
    const data = result.data as Record<string, unknown>;
    ok((data.violations as unknown[]).length > 0);
  });

  it('continues on warning-level constraints', async () => {
    writeSkillMd(`---
name: http-skill
description: A skill with HTTP operations
---
# HTTP Skill

## Procedures
1. fetch data from remote API with HTTP GET request
`);

    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    strictEqual(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    ok((data.warnings as unknown[]).length > 0);
  });

  it('filters output by --target', async () => {
    writeSkillMd(`---
name: filtered-skill
description: test
---
# Test`);
    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
      '--target', 'claude',
    ]);

    strictEqual(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const emitted = data.emitted as string[];
    ok(emitted.includes('skill.claude.xml'));
    strictEqual(emitted.includes('skill.generic.md'), false);
  });

  it('includes source_hash and compiled_at in output', async () => {
    writeSkillMd(`---
name: hash-skill
description: test
---
# Test`);
    const result = await main([
      '--skill-dir', SKILL_DIR,
      '--workdir', WORKDIR,
    ]);

    const data = result.data as Record<string, unknown>;
    ok(typeof data.source_hash === 'string');
    strictEqual(data.source_hash.length, 64);
    ok(typeof data.compiled_at === 'string');
  });
});
```

- [ ] **Step 2: Run tests — verify RED**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/compile.test.ts
```
Expected: all tests FAIL

- [ ] **Step 3: Write the compile command implementation**

```typescript
// .claude/skills/srs-formalizer/scripts/commands/compile.ts
// compile — skill compilation command (Phase 1-4 pipeline)
// CLI: npx tsx index.ts compile --skill-dir <path> --workdir .srs_formalizer

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult } from '../types/index.js';
import type { SkillIR } from '../types/skir.js';
import { validateWorkDir } from '../lib/security.js';
import { parseRawSkillMd, buildSkIR } from '../lib/skir-builder.js';
import { inject, getViolationsByLevel } from '../lib/anti-skill.js';
import { validateSkIR, hasBlockingViolations } from '../lib/compile-validator.js';
import { ClaudeXmlEmitter } from '../lib/emitter-claude-xml.js';
import { GenericMarkdownEmitter } from '../lib/emitter-generic-md.js';

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

interface CompileData {
  skir_path: string;
  emitted: string[];
  constraints_injected: number;
  security_level: string;
  source_hash: string;
  compiled_at: string;
  warnings?: Array<{ rule: string; detail: string }>;
  violations?: Array<{ rule: string; level: string; detail: string; found_in: string }>;
}

export async function main(args: string[]): Promise<CliResult> {
  const skillDirArg = parseArg(args, '--skill-dir');
  const workDirArg = parseArg(args, '--workdir');
  const targetFilter = parseArg(args, '--target');

  if (!skillDirArg) {
    return { status: 'error', message: 'Missing required argument: --skill-dir' };
  }
  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const skillDir = path.resolve(skillDirArg);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
    return { status: 'error', message: `Skill directory not found: ${skillDir}` };
  }
  if (!fs.existsSync(skillMdPath)) {
    return { status: 'error', message: `SKILL.md not found in: ${skillDir}` };
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 1: Parse
  // ═══════════════════════════════════════════════════════════
  let content: string;
  try {
    content = fs.readFileSync(skillMdPath, 'utf-8');
  } catch (err) {
    return { status: 'error', message: `Failed to read SKILL.md: ${(err as Error).message}` };
  }

  let raw;
  try {
    raw = parseRawSkillMd(content, skillMdPath);
  } catch (err) {
    return { status: 'error', message: `Parse error: ${(err as Error).message}` };
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2: IR Build
  // ═══════════════════════════════════════════════════════════
  let ir: SkillIR;
  try {
    ir = buildSkIR(raw);
  } catch (err) {
    return { status: 'error', message: `IR build error: ${(err as Error).message}` };
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: Inject Anti-Skill Constraints
  // ═══════════════════════════════════════════════════════════
  ir = inject(ir);

  // Check for blocking violations (error/critical)
  const criticals = getViolationsByLevel(ir, 'critical');
  const errors = getViolationsByLevel(ir, 'error');
  const warnings = getViolationsByLevel(ir, 'warning');

  if (criticals.length > 0 || errors.length > 0) {
    const violations = [...criticals, ...errors].map(v => ({
      rule: 'anti-skill',
      level: v.level,
      detail: v.content,
      found_in: 'procedure text',
    }));

    return {
      status: 'error',
      message: `Compilation blocked: ${violations.length} violation(s) require resolution` +
        (criticals.length > 0 ? ' (includes HITL-required critical violations)' : ''),
      data: { violations },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 4: Validate SkIR Schema
  // ═══════════════════════════════════════════════════════════
  const checks = validateSkIR(ir);
  if (hasBlockingViolations(checks)) {
    const failed = checks.filter(c => !c.passed);
    return {
      status: 'error',
      message: `IR validation failed: ${failed.map(c => `${c.name}: ${c.detail}`).join('; ')}`,
      data: { checks: failed },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 5: Emit
  // ═══════════════════════════════════════════════════════════
  const emitted: string[] = [];
  const ctxDir = path.join(workDir, '_ctx');
  fs.mkdirSync(ctxDir, { recursive: true });

  // Claude XML: when platform_activation includes claude-code or trae
  const hasClaudePlatform = ir.platform_activation['claude-code'] || ir.platform_activation['trae'];
  if (hasClaudePlatform && (!targetFilter || targetFilter === 'claude')) {
    const claudeEmitter = new ClaudeXmlEmitter();
    const xmlContent = claudeEmitter.emit(ir);
    fs.writeFileSync(path.join(ctxDir, 'skill.claude.xml'), xmlContent, 'utf-8');
    emitted.push('skill.claude.xml');
  }

  // Generic Markdown: always (fallback for all platforms)
  if (!targetFilter || targetFilter === 'generic') {
    const genericEmitter = new GenericMarkdownEmitter();
    const mdContent = genericEmitter.emit(ir);
    fs.writeFileSync(path.join(ctxDir, 'skill.generic.md'), mdContent, 'utf-8');
    emitted.push('skill.generic.md');
  }

  // Write skir.json
  const skirOutput = { ...ir };
  fs.writeFileSync(
    path.join(ctxDir, 'skir.json'),
    JSON.stringify(skirOutput, null, 2),
    'utf-8',
  );

  // Source hash
  const sourceHash = crypto.createHash('sha256')
    .update(content)
    .digest('hex');

  const compileData: CompileData = {
    skir_path: '_ctx/skir.json',
    emitted,
    constraints_injected: ir.anti_skill_constraints.length,
    security_level: ir.security_level,
    source_hash: sourceHash,
    compiled_at: new Date().toISOString(),
  };

  if (warnings.length > 0) {
    compileData.warnings = warnings.map(w => ({
      rule: 'anti-skill',
      detail: w.content,
    }));
  }

  return { status: 'ok', data: compileData };
}
```

- [ ] **Step 4: Run tests — verify GREEN**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/compile.test.ts
```
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/commands/compile.ts .claude/skills/srs-formalizer/scripts/__tests__/compile.test.ts
git commit -m "feat(compile): add skill compilation command (4-phase pipeline)

Phase 1: Parse SKILL.md → Phase 2: Build SkIR → Phase 3: Inject Anti-Skill
constraints → Phase 4: Validate schema → Phase 5: Emit platform artifacts.
Outputs: _ctx/skir.json, skill.claude.xml, skill.generic.md.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Register compile in CLI index

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/index.ts`

**Interfaces:**
- Consumes: `compile.ts` main() function
- Produces: `compile` CLI command accessible via `npx tsx index.ts compile ...`

- [ ] **Step 1: Add compile case to index.ts**

```typescript
// Insert after the 'clean' case or before the default case
    case 'compile': {
      const { main: compileMain } = await import('./commands/compile.js');
      const result = await compileMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
```

Also add `compile` to the USAGE string (line 7 of index.ts), inserting between `clean` and `pack-skill` in the commands list:

```
  compile            Compile SKILL.md → SkIR + platform-specific artifacts
```

And add to the help text's Commands section:
```
  compile            Compile SKILL.md into SkIR, inject safety constraints, emit artifacts
```

- [ ] **Step 2: Verify CLI works**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx index.ts compile --help 2>&1 || true
npx tsx index.ts --help 2>&1 | grep -c compile
```
Expected: `--help` output contains "compile" command description

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/index.ts
git commit -m "feat(cli): register compile command in index.ts

18th CLI command, follows existing pattern (parseArg + validateWorkDir).
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Update SKILL.md frontmatter

**Files:**
- Modify: `.claude/skills/srs-formalizer/SKILL.md`

- [ ] **Step 1: Add SkCC extension fields to frontmatter**

Add the following between `version: "0.3.0"` and `trigger_keywords`:

```yaml
  compatibility: requires Node.js≥20, typescript≥5.5, Claude Code≥1.0
  security_level: high
  permissions:
    - kind: filesystem
      scope: ".srs_formalizer/*"
      description: All pipeline outputs limited to working directory
      read_only: false
    - kind: network
      scope: "https://api.search.brave.com/*"
      description: S1 deep research retrieval only
      read_only: true
    - kind: execute
      scope: "npx tsx .claude/skills/srs-formalizer/scripts/*"
      description: Only srs-formalizer CLI commands
      read_only: false
```

Also update `version` from `"0.3.0"` to `"0.4.0"`.

- [ ] **Step 2: Add `compile` to the quick reference table in SKILL.md**

Add after the `| capability-probe --mode generate\|score [--file <path>] | LLM 能力探测（出题+判分） | S0 |` line:

```markdown
| `compile --skill-dir <path> --workdir .srs_formalizer` | 编译 SKILL.md → SkIR + 安全注入 + 平台发射 | 技能加载时 |
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/SKILL.md
git commit -m "chore(skill): update SKILL.md to v0.4.0 with SkCC compliance fields

Add security_level, permissions, compatibility. Update version to 0.4.0.
Add compile command to quick reference table.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Update orchestrator and changelog

**Files:**
- Modify: `.claude/skills/srs-formalizer/prompts/orchestrator_stage_S1.md`
- Modify: `.claude/skills/srs-formalizer/CHANGELOG.md`

- [ ] **Step 1: Add compile step to orchestrator_stage_S1.md**

Insert before "### 步骤 1：初始化工作目录":

```markdown
### 步骤 0：编译技能（技能加载时执行一次）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts compile \
  --skill-dir .claude/skills/srs-formalizer \
  --workdir .srs_formalizer
```

验证输出为 `{"status":"ok"}`。编译产物写入 `_ctx/skir.json`、`_ctx/skill.claude.xml`、`_ctx/skill.generic.md`。

若 `status: error`（Anti-Skill 检测到 error/critical 违规）：
- 列出 violations → 要求人类修正技能文件
- 标记 STATE.md 为 BLOCKED
- 等待人类确认后重新编译

若 `status: ok` 但有 warnings（如 http-safety 警告）：
- 记录到 STATE.md 决策记录
- 流水线继续（warning 不阻断）
```

- [ ] **Step 2: Update CHANGELOG.md**

Add at the top:

```markdown
## [0.4.0] - 2026-07-01

### Added
- `compile` command: 四阶段编译流水线（Parse→IR Build→Inject→Emit）
- SkIR (Skill Intermediate Representation): 30+ 强类型字段，对标 SkCC (arXiv:2605.03353)
- Anti-Skill 注入器: 7 条安全规则（4 条 SkCC 通用 + 3 条 srs-formalizer 特有），三级 severity (warning/error/critical)
- Claude XML 语义分层发射器: `<execution_steps>`, `<strict_constraints>`, `<permissions>`, `<examples>` 标签
- Generic Markdown 发射器: 跨平台兜底（OpenCode, Cursor, Windsurf, Qoder 等 7+ 平台）
- 编译时 schema 校验: name(kebab-case), description(≤1024), security_level 枚举
- SKILL.md 新增 `security_level`, `permissions`, `compatibility` 字段（向后兼容）

### Changed
- 版本号: 0.3.0 → 0.4.0
- orchestrator_stage_S1.md: 新增步骤 0（compile）

### Security
- 编译时行为安全约束注入（94.8% 安全触发率基准，对标 SkCC）
- 安全三层级联：文件完整性 → IR 编译+Anti-Skill → 数据门禁
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/prompts/orchestrator_stage_S1.md .claude/skills/srs-formalizer/CHANGELOG.md
git commit -m "chore: integrate compile command into pipeline and changelog

Orchestrator S1 gets Step 0 (compile). CHANGELOG records v0.4.0.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```
Expected: all tests PASS (existing 168 + new 27 = 195)

- [ ] **Step 2: Run typecheck**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: no type errors

- [ ] **Step 3: Manual compile smoke test**

```bash
mkdir -p /tmp/smoke-test/.srs_formalizer
npx tsx .claude/skills/srs-formalizer/scripts/index.ts compile \
  --skill-dir .claude/skills/srs-formalizer \
  --workdir /tmp/smoke-test/.srs_formalizer
```
Expected: `{"status":"ok","data":{...}}` with `emitted` containing both `skill.claude.xml` and `skill.generic.md`

- [ ] **Step 4: Verify output files**

```bash
echo "=== skir.json ===" && wc -c /tmp/smoke-test/.srs_formalizer/_ctx/skir.json
echo "=== Claude XML ===" && grep -c '<agent_skill>' /tmp/smoke-test/.srs_formalizer/_ctx/skill.claude.xml
echo "=== Generic MD ===" && grep -c '## Description' /tmp/smoke-test/.srs_formalizer/_ctx/skill.generic.md
```
Expected: skir.json > 0 bytes, Claude XML contains `<agent_skill>`, Generic MD contains `## Description`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final verification — all 195 tests pass, typecheck clean"
```
