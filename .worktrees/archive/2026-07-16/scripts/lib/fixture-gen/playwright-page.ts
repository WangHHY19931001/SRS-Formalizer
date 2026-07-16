/**
 * Playwright Page Object fixture generation.
 * Uses template-engine for all output.
 */

import type { FixtureFile, ParsedScenario } from './types.js';
import { toPascalCase, escapeStr } from './helpers.js';
import { loadTemplate, renderTemplate } from './template-engine.js';

/** Generate Playwright Page Object fixtures from parsed scenarios */
export function generatePlaywrightPageObjectFixtures(scenarios: ParsedScenario[]): FixtureFile[] {
  const pageName = extractPageName(scenarios);
  const className = toPascalCase(pageName) + 'Page';

  const pageTemplate = loadTemplate('playwright', 'page.ts');
  const pageContent = renderTemplate(pageTemplate, {
    PAGE_CLASS: className,
    PAGE_NAME: pageName,
  });

  const specTemplate = loadTemplate('playwright', 'spec.ts');
  const tests = scenarios.map(s => {
    const body = s.params.length > 0
      ? s.params.map(p => `    // LLM_FILL: setup ${p}`).join('\n')
      : '    // LLM_FILL: implement test';
    return `  test('${escapeStr(s.name)}', async ({ page }) => {\n    const ${pageName} = new ${className}(page);\n${body}\n  });`;
  }).join('\n\n');
  const specContent = renderTemplate(specTemplate, {
    PAGE_CLASS: className,
    MODULE: className,
    TESTS: tests,
  });

  return [
    { path: `pages/page.ts`, content: pageContent },
    { path: `tests/${className}.spec.ts`, content: specContent },
  ];
}

/** Extract page name from Feature name */
function extractPageName(scenarios: ParsedScenario[]): string {
  const featureName = scenarios[0]?.featureName;
  if (featureName) {
    return featureName.replace(/Page$/i, '');
  }
  return 'page';
}
