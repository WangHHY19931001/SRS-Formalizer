/**
 * BDD fixture generator.
 * Parses .feature files and generates framework-specific test skeletons
 * with LLM_FILL markers for semantic content. All output via template-engine.
 */

import type { Framework, FixtureFile, ParsedScenario } from './types.js';
import { generatePlaywrightPageObjectFixtures } from './playwright-page.js';
import { toCamelCase, toPascalCase, toSnakeCase, escapeStr } from './helpers.js';
import { loadTemplate, renderTemplate } from './template-engine.js';

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
  const featureMatch = content.match(/^Feature:\s*(.+)$/m);
  const featureName = featureMatch?.[1]?.trim();
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

    scenarios.push({ name: header, requirementId, given, when, then, params, ...(featureName !== undefined && { featureName }) });
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
    case 'playwright': return generatePlaywrightPageObjectFixtures(scenarios);
    case 'pytest': return generateFromTemplate(scenarios, safeName, 'pytest');
    case 'junit': return generateFromTemplate(scenarios, safeName, 'junit');
    case 'fast-check': return generateFromTemplate(scenarios, safeName, 'fast-check');
    default: throw new Error(`Unknown framework: ${String(framework)}`);
  }
}

// ── Template-based generation (pytest / junit / fast-check) ──────────────

function generateFromTemplate(
  scenarios: ParsedScenario[],
  module: string,
  framework: 'pytest' | 'junit' | 'fast-check',
): FixtureFile[] {
  const template = loadTemplate(framework, 'scenario');

  const renderVars: Record<string, string> = {
    MODULE: module,
    CLASS_NAME: toPascalCase(module).replace(/[^\w]/g, ''),
  };

  if (framework === 'pytest') {
    const tests = scenarios.map(s => {
      const paramLines = s.params.map(p => `    ${p} = "LLM_FILL_VALUE"  # LLM_FILL: replace`).join('\n');
      const body = s.params.length > 0 ? paramLines + '\n    ' : '    ';
      return `def test_${toSnakeCase(s.requirementId)}():\n${body}# LLM_FILL: implement assertion\n    pass`;
    }).join('\n\n');
    renderVars['TESTS'] = tests;
    const content = renderTemplate(template, renderVars);
    return [{ path: `tests/test_${module}.py`, content }];
  }

  if (framework === 'junit') {
    const methods = scenarios.map(s => {
      const body = s.params.length > 0
        ? s.params.map(p => `        // LLM_FILL: setup ${p}`).join('\n')
        : '        // LLM_FILL: implement test';
      return `    @Test\n    void ${toCamelCase(s.requirementId)}() {\n${body}\n    }`;
    }).join('\n\n');
    renderVars['METHODS'] = methods;
    const content = renderTemplate(template, renderVars);
    return [{ path: `src/test/java/${renderVars['CLASS_NAME']}Test.java`, content }];
  }

  // fast-check
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
  renderVars['PROPERTIES'] = props;
  const content = renderTemplate(template, renderVars);
  return [{ path: `properties/${module}.property.ts`, content }];
}

// ── Cucumber (keep inline — structure unique, not suited to generic template) ─────────────

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
