// .claude/skills/srs-formalizer/scripts/__tests__/skir-builder.test.ts
import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
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
