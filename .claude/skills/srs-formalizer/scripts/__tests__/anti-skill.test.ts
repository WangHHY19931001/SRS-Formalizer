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
