/**
 * Playwright Page Object fixture generation.
 * Extracted from bdd.ts to keep files under 300-line limit.
 */

import type { FixtureFile, ParsedScenario } from './types.js';
import { toPascalCase, escapeStr } from './helpers.js';

/** Generate Playwright Page Object fixtures from parsed scenarios */
export function generatePlaywrightPageObjectFixtures(scenarios: ParsedScenario[]): FixtureFile[] {
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

/** Extract page name from Feature name, converting to PascalCase with Page suffix */
function extractPageName(scenarios: ParsedScenario[]): string {
  const featureName = scenarios[0]?.featureName;
  if (featureName) {
    return featureName.replace(/Page$/i, '');
  }
  return 'page';
}
