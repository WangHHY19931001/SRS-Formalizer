// === Gherkin 生成器 ===

export interface BddScenario {
  name: string;
  requirementId: string;
  given: string[];
  when: string[];
  then: string[];  // 初始为 ["<THEN_PLACEHOLDER>"]
  verification_method?: string;
}

export interface BddFeature {
  system: string;
  trace: string;
  module: string;
  scenarios: BddScenario[];
}

/** 生成 .feature 文件内容 */
export function generateFeature(feature: BddFeature): string {
  const header = `# SYSTEM: ${feature.system}
# TRACE: ${feature.trace}
# TLA_REFS: PENDING
# LEAN_REFS: PENDING`;

  const scenarios = feature.scenarios.map(s => {
    const steps = [
      ...s.given.map(g => `    Given ${g}`),
      ...s.when.map(w => `    When ${w}`),
      ...s.then.map(t => `    Then ${t}`),
    ];
    if (s.verification_method) {
      steps.push(`    # verification_method: ${s.verification_method}`);
    }
    return `  Scenario: ${s.name}\n${steps.join('\n')}`;
  }).join('\n\n');

  return `${header}\n\nFeature: ${feature.module}\n\n${scenarios}\n`;
}
