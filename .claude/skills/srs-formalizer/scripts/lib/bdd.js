// === Gherkin 生成器 ===
/** 生成 .feature 文件内容 */
export function generateFeature(feature) {
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
/** 校验 .feature 文件内容 */
export function validateFeature(content) {
    const errors = [];
    const warnings = [];
    if (!content.includes('Feature:'))
        errors.push('Missing Feature: declaration');
    if (!content.includes('Scenario:'))
        errors.push('Missing Scenario: declaration');
    if (!content.includes('Given '))
        errors.push('Missing Given step');
    if (!content.includes('When '))
        errors.push('Missing When step');
    if (!content.includes('Then '))
        errors.push('Missing Then step');
    if (content.includes('<THEN_PLACEHOLDER>'))
        errors.push('Unresolved <THEN_PLACEHOLDER> placeholder');
    // HEADER checks (SRS §8.2)
    if (!content.includes('# SYSTEM:'))
        warnings.push('Missing # SYSTEM: header');
    if (!content.includes('# TRACE:'))
        warnings.push('Missing # TRACE: header');
    return { valid: errors.length === 0, errors, warnings };
}
//# sourceMappingURL=bdd.js.map