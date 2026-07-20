import { hasNegation } from './text-analysis.js';

export interface BddValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MUSTACHE_PATTERN = /\{\{\w+\}\}/;

const LLM_FILL_PATTERNS = [
  /<LLM_FILL>/i,
  /<THEN_PLACEHOLDER>/i,
  /<TODO>/i,
  /<FILL_HERE>/i,
  /<INSERT_.*>/i,
  /\[TODO\]/i,
  /\[FIXME\]/i,
  /\b(?:TBD|GAP)\b/i,
  /待定|未定义|待实现/i,
];

export function validateFeatureBasic(content: string, strict: boolean = false): BddValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content.includes('Feature:')) errors.push('Missing Feature: declaration');
  if (!content.includes('Scenario:')) errors.push('Missing Scenario: declaration');
  if (!content.includes('Given ')) errors.push('Missing Given step');
  if (!content.includes('When ')) errors.push('Missing When step');
  if (!content.includes('Then ')) errors.push('Missing Then step');

  if (MUSTACHE_PATTERN.test(content)) {
    errors.push('Unresolved Mustache placeholder found');
  }

  if (strict) {
    for (const pattern of LLM_FILL_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`LLM_FILL residual detected: ${pattern.source}`);
      }
    }
  }

  if (!content.includes('# SYSTEM:')) warnings.push('Missing # SYSTEM: header');
  if (!content.includes('# TRACE:')) warnings.push('Missing # TRACE: header');

  return { valid: errors.length === 0, errors, warnings };
}

const NFR_THRESHOLD_PATTERN = /\b\d+(\.\d+)?\s*(ms|s|min|%|B|KB|MB|GB|rps|rpm)\b/i;

const AUTH_PRECONDITIONS = [
  /Given.*(?:用户已通过身份认证|user is authenticated|authenticated user)/i,
  /Given.*(?:当前用户已登录|current user is logged in)/i,
];

const FILENAME_REQUIREMENT_PATTERN = /^[a-z][a-z0-9_]*(?:_[a-z0-9_]+)*\.feature$/;

export function validateFeatureNFR(content: string, fileName: string): BddValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (content.includes('<THEN_PLACEHOLDER>')) {
    errors.push('Unresolved <THEN_PLACEHOLDER> placeholder in NFR feature');
  }

  if (MUSTACHE_PATTERN.test(content)) {
    errors.push('Unresolved Mustache placeholder in NFR feature');
  }

  const hasSecurityScenario = /scenario:.*security/i.test(content)
    || /NFR Security/i.test(content)
    || content.includes('未认证')
    || content.includes('认证用户');

  if (hasSecurityScenario) {
    const hasAuth = AUTH_PRECONDITIONS.some(p => p.test(content));
    if (!hasAuth) {
      warnings.push('Security scenario lacks authentication precondition');
    }
  }

  if (!FILENAME_REQUIREMENT_PATTERN.test(fileName)) {
    warnings.push(`Feature file name "${fileName}" violates naming convention (snake_case.feature)`);
  }

  const thresholdMatches = content.match(NFR_THRESHOLD_PATTERN);
  if (!thresholdMatches) {
    warnings.push('NFR feature missing threshold value pattern (e.g. "200 ms")');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Semantic heuristics (proposal §1.3): catch "syntactically valid but
// semantically hollow" BDD that passes format gates yet asserts nothing. ---

/** Generic, module-agnostic When placeholders that carry no real trigger semantics (B-2). */
const GENERIC_WHEN_PATTERNS = [
  /When\s+the system processes the requirement\b/i,
  /When\s+系统处理(该)?需求/,
  /When\s+the system (handles|executes) the requirement\b/i,
];

/** Generic Given boilerplate reused across every module with no differentiation (B-4). */
const GENERIC_GIVEN_PATTERNS = [
  /Given\s+the .+ subsystem is initialized and operational\b/i,
  /Given\s+.+子系统(已)?初始化(并)?(可)?(正常)?运行/,
];

/** Directive/spec-sentence modals that signal the Then step is restating the requirement, not asserting an observable outcome (B-1). */
const DIRECTIVE_MODAL = /(必须|应当|应该|shall\b|\bmust\b)/i;

/** Feature domains where a negative boundary constraint ("must NOT ...") is mandatory (B-3). */
const CONSTRAINT_DOMAINS = /(security|approval|governance|audit|compliance|安全|审批|治理|审计|合规|授权)/i;

function stepLines(content: string, keywords: RegExp): string[] {
  return content.split('\n').map(l => l.trim()).filter(l => keywords.test(l));
}

/**
 * Semantic validation of an enriched .feature file. Errors block promotion;
 * warnings are surfaced for review. Content-only — no IR access required.
 */
export function validateFeatureSemantics(content: string, fileName: string): BddValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const pattern of GENERIC_WHEN_PATTERNS) {
    if (pattern.test(content)) {
      errors.push('Generic placeholder When step (e.g. "processes the requirement") — bind When to a concrete trigger event');
      break;
    }
  }
  for (const pattern of GENERIC_GIVEN_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push('Generic Given boilerplate reused without module-specific state — enumerate concrete precondition state');
      break;
    }
  }

  // Then/And steps: strip trailing "# ..." comment annotations before analysis.
  const thenSteps = stepLines(content, /^(Then|And|But)\s+/).map(l => l.replace(/#.*$/, '').trim());
  for (const step of thenSteps) {
    if (DIRECTIVE_MODAL.test(step) && !hasNegation(step)) {
      warnings.push(`Then step restates the requirement statement instead of asserting an observable outcome: "${step.slice(0, 60)}"`);
    }
  }

  // Constraint domains must include at least one negative-boundary assertion.
  if (CONSTRAINT_DOMAINS.test(content)) {
    const hasNegativeConstraint = thenSteps.some(step =>
      hasNegation(step) || /\bdoes not\b|\bmust not\b|\bcannot\b|\bshall not\b|\bis (denied|rejected|blocked|held)\b/i.test(step));
    if (!hasNegativeConstraint) {
      errors.push(`Constraint-domain feature "${fileName}" lacks a negative-boundary scenario (system must NOT ...) — required for security/approval/governance/audit/compliance`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
