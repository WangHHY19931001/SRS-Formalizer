/**
 * BDD fixture generator.
 * Parses .feature files and generates framework-specific test skeletons
 * with LLM_FILL markers for semantic content.
 */

import type { Framework, FixtureFile, ParsedScenario } from './types.js';

/** Alias for parseFeature — parses Gherkin scenarios from .feature content */
export function parseScenario(content: string): ParsedScenario[] {
  return parseFeature(content);
}

/** Generate fixtures from pre-parsed scenarios */
export function generateFixtures(
  scenarios: ParsedScenario[],
  framework: string,
): FixtureFile[] {
  if (framework === 'playwright') {
    return generatePlaywrightPageObjectFixtures(scenarios);
  }
  throw new Error(`Unsupported framework: ${String(framework)}`);
}

/** Parse Gherkin scenarios from .feature content */
export function parseFeature(content: string): ParsedScenario[] {
  const scenarios: ParsedScenario[] = [];
  const scenarioBlocks = content.split(/(?=^\s+Scenario(?:\s+Outline)?:)/m);

  for (const block of scenarioBlocks) {
    const headerMatch = block.match(/^\s+Scenario(?:\s+Outline)?:\s+(.+)$/m);
    if (!headerMatch?.[1]) continue;

    const header = headerMatch[1].trim();
    const idMatch = header.match(/^([\w-]+):/);
    const requirementId = idMatch?.[1] ?? 'UNKNOWN';

    const given: string[] = [];
    const when: string[] = [];
    const then: string[] = [];
    const params: string[] = [];

    const lines = block.split('\n');
    let currentStep: 'given' | 'when' | 'then' | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Given ')) {
        currentStep = 'given';
        given.push(trimmed.slice(6));
      } else if (trimmed.startsWith('When ')) {
        currentStep = 'when';
        when.push(trimmed.slice(5));
      } else if (trimmed.startsWith('Then ')) {
        currentStep = 'then';
        then.push(trimmed.slice(5));
      } else if (trimmed.startsWith('And ') && currentStep) {
        const stepText = trimmed.slice(4);
        if (currentStep === 'given') given.push(stepText);
        else if (currentStep === 'when') when.push(stepText);
        else then.push(stepText);
      }
    }

    const allSteps = [...given, ...when, ...then];
    for (const step of allSteps) {
      const paramMatches = step.matchAll(/<(\w+)>/g);
      for (const m of paramMatches) {
        if (m[1] && !params.includes(m[1])) params.push(m[1]);
      }
    }

    scenarios.push({ name: header, requirementId, given, when, then, params });
  }

  return scenarios;
}

/** Generate fixture files for a given framework */
export function generateBddFixtures(
  featureContent: string,
  moduleName: string,
  framework: Framework,
): FixtureFile[] {
  const scenarios = parseFeature(featureContent);
  const safeName = moduleName.replace(/[/\\?%*:|"<>]/g, '_');

  switch (framework) {
    case 'cucumber': return generateCucumber(scenarios, safeName);
    case 'playwright': return generatePlaywright(scenarios, safeName);
    case 'pytest': return generatePytest(scenarios, safeName);
    case 'junit': return generateJunit(scenarios, safeName);
    case 'fast-check': return generateFastCheck(scenarios, safeName);
    default: throw new Error(`Unknown framework: ${String(framework)}`);
  }
}

// ── Cucumber ──────────────────────────────────────────────────────────────

function generateCucumber(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const steps = scenarios.map(s => {
    const stepDefs = s.given.map(g => buildStepDef('Given', g))
      .concat(s.when.map(w => buildStepDef('When', w)))
      .concat(s.then.map(t => buildStepDef('Then', t)));
    return stepDefs.join('\n\n');
  }).join('\n\n');

  const world = `import { setWorldConstructor } from '@cucumber/cucumber';

class CustomWorld {
  currentUser?: { id: string; role: string };
  // LLM_FILL: add world state properties
}

setWorldConstructor(CustomWorld);
export default CustomWorld;
`;

  const fixtures = scenarios.map(s => {
    const params = s.params.length > 0
      ? s.params.map(p => `  // LLM_FILL: generate test data for ${p}`).join('\n')
      : '  // LLM_FILL: generate test data';
    return `export const ${toCamelCase(s.requirementId)}_data = {\n${params}\n};`;
  }).join('\n\n');

  return [
    { path: `steps/${module}_steps.ts`, content: `import { Given, When, Then } from '@cucumber/cucumber';\n\n${steps}\n` },
    { path: 'support/world.ts', content: world },
    { path: `fixtures/${module}_data.ts`, content: fixtures + '\n' },
  ];
}

function buildStepDef(keyword: string, stepText: string): string {
  const pattern = stepText
    .replace(/<(\w+)>/g, '{string}')
    .replace(/"/g, '\\"');
  const params = [...stepText.matchAll(/<(\w+)>/g)].map(m => m[1]);
  const args = params.map(p => `${p}: string`).join(', ');
  return `${keyword}('${pattern}', async function (${args}) {\n  // LLM_FILL: implement step\n  throw new Error('Not implemented — LLM must fill');\n});`;
}

// ── Playwright ────────────────────────────────────────────────────────────

function generatePlaywright(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const tests = scenarios.map(s => {
    const body = s.params.length > 0
      ? s.params.map(p => `    // LLM_FILL: setup ${p}`).join('\n')
      : '    // LLM_FILL: implement test';
    return `  test('${escapeStr(s.name)}', async ({ page }) => {\n${body}\n  });`;
  }).join('\n\n');

  const spec = `import { test, expect } from '@playwright/test';

test.describe('${module}', () => {

${tests}

});
`;

  const fixtures = `import { test as base } from '@playwright/test';

export const test = base.extend<{/* LLM_FILL: custom fixtures */}>({
  // LLM_FILL: define custom fixtures
});

export { expect };
`;

  return [
    { path: `tests/${module}.spec.ts`, content: spec },
    { path: `fixtures/${module}.fixtures.ts`, content: fixtures },
  ];
}

function generatePlaywrightPageObjectFixtures(scenarios: ParsedScenario[]): FixtureFile[] {
  const pageName = extractPageName(scenarios);
  const className = toPascalCase(pageName) + 'Page';

  const pageContent = `import type { Page } from '@playwright/test';

export class ${className} {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/* LLM_FILL: URL */');
  }

  async getState() {
    // LLM_FILL: extract page state
    return {};
  }
}
`;

  const tests = scenarios.map(s => {
    const body = s.params.length > 0
      ? s.params.map(p => `    // LLM_FILL: setup ${p}`).join('\n')
      : '    // LLM_FILL: implement test';
    return `  test('${escapeStr(s.name)}', async ({ page }) => {\n    const ${pageName} = new ${className}(page);\n${body}\n  });`;
  }).join('\n\n');

  const specContent = `import { test, expect } from '@playwright/test';
import { ${className} } from '../pages/page';

test.describe('${className}', () => {

${tests}

});
`;

  return [
    { path: `pages/page.ts`, content: pageContent },
    { path: `tests/${className}.spec.ts`, content: specContent },
  ];
}

function extractPageName(scenarios: ParsedScenario[]): string {
  for (const s of scenarios) {
    for (const step of [...s.given, ...s.when, ...s.then]) {
      const m = step.match(/on the (\w+) page/i);
      if (m?.[1]) return m[1];
    }
  }
  if (scenarios[0]) {
    const firstWord = scenarios[0].name.split(/\s+/)[0];
    if (firstWord) return firstWord.toLowerCase();
  }
  return 'page';
}

// ── Pytest ────────────────────────────────────────────────────────────────

function generatePytest(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const tests = scenarios.map(s => {
    const paramLines = s.params.map(p => `    ${p} = "LLM_FILL_VALUE"  # LLM_FILL: replace`).join('\n');
    const body = s.params.length > 0 ? paramLines + '\n    ' : '    ';
    return `def test_${toSnakeCase(s.requirementId)}():\n${body}# LLM_FILL: implement assertion\n    pass`;
  }).join('\n\n');

  const testFile = `"""${module} test fixtures — generated by srs-formalizer"""\n\n${tests}\n`;

  const conftest = `"""Shared fixtures for ${module}"""\n\nimport pytest\n\n# LLM_FILL: define shared fixtures\n`;

  return [
    { path: `tests/test_${module.replace(/[/\\?%*:|"<>]/g, '_')}.py`, content: testFile },
    { path: 'conftest.py', content: conftest },
  ];
}

// ── JUnit ─────────────────────────────────────────────────────────────────

function generateJunit(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const className = toPascalCase(module).replace(/[^\w]/g, '') + 'Test';
  const methods = scenarios.map(s => {
    const body = s.params.length > 0
      ? s.params.map(p => `        // LLM_FILL: setup ${p}`).join('\n')
      : '        // LLM_FILL: implement test';
    return `    @Test\n    void ${toCamelCase(s.requirementId)}() {\n${body}\n    }`;
  }).join('\n\n');

  const testClass = `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className} {

${methods}

}
`;

  const fixtureClass = `// LLM_FILL: define shared test fixtures for ${module}
public class ${toPascalCase(module)}Fixture {
    // LLM_FILL: fixture methods
}
`;

  return [
    { path: `src/test/java/${className}.java`, content: testClass },
    { path: `fixtures/${toPascalCase(module).replace(/[^\w]/g, '')}Fixture.java`, content: fixtureClass },
  ];
}

// ── fast-check ────────────────────────────────────────────────────────────

function generateFastCheck(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const props = scenarios.map(s => {
    const arbitraries = s.params.length > 0
      ? s.params.map(p => `  const ${p}Arb = fc.string();  // LLM_FILL: refine arbitrary`).join('\n')
      : '  // LLM_FILL: define arbitraries';
    return `describe('${s.requirementId}', () => {
  it('${escapeStr(s.name)}', () => {
${arbitraries}

    fc.assert(
      fc.property(${s.params.length > 0 ? `fc.tuple(/* LLM_FILL: tuple of arbitraries */)` : `fc.constant(null)`}, (${s.params.join(', ')}) => {
        // LLM_FILL: implement property
        return true;
      })
    );
  });
});`;
  }).join('\n\n');

  const propFile = `import * as fc from 'fast-check';

describe('${module}', () => {

${props}

});
`;

  return [
    { path: `properties/${module.replace(/[/\\?%*:|"<>]/g, '_')}.property.ts`, content: propFile },
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toCamelCase(s: string): string {
  return s.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(\w)/, (_, c: string) => c.toLowerCase());
}

function toPascalCase(s: string): string {
  const camel = toCamelCase(s);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
