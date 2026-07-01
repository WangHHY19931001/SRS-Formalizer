// .claude/skills/srs-formalizer/scripts/__tests__/emitter.test.ts
// Generic Markdown Emitter — test suite
// Claude XML emitter tests are in emitter-claude-xml.test.ts (Task 5, 22 tests)
import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { GenericMarkdownEmitter } from '../lib/emitter-generic-md.js';
import type { SkillIR } from '../types/skir.js';

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
