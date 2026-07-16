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
