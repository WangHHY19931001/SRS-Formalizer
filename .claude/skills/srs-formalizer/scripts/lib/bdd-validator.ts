export interface BddValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MUSTACHE_PATTERN = /\{\{\w+\}\}/;

const LLM_FILL_PATTERNS = [
  /<LLM_FILL>/i,
  /<TODO>/i,
  /<FILL_HERE>/i,
  /<INSERT_.*>/i,
  /\[TODO\]/i,
  /\[FIXME\]/i,
];

export function validateFeatureBasic(content: string): BddValidationResult {
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

  for (const pattern of LLM_FILL_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`LLM_FILL residual detected: ${pattern.source}`);
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
