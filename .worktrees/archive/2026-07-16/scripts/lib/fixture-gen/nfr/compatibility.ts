/**
 * Compatibility NFR fixture generators.
 * Generators for cucumber and playwright frameworks.
 */

import type { Framework, GeneratorFn } from './types.js';

export const compatibility: Partial<Record<Framework, GeneratorFn>> = {
  cucumber: (m) => `Feature: ${m} compatibility
  As a user of ${m}
  I want cross-platform compatibility
  So that the system works across all target environments

  Scenario: Renders correctly on Chrome
    Given the user is on Chrome browser
    When the ${m} page loads
    Then all elements are visible and functional

  Scenario: Renders correctly on Firefox
    Given the user is on Firefox browser
    When the ${m} page loads
    Then all elements are visible and functional

  Scenario: Renders correctly on Safari
    Given the user is on Safari browser
    When the ${m} page loads
    Then all elements are visible and functional

  Scenario: Renders correctly on mobile
    Given the user is on a mobile device
    When the ${m} page loads
    Then the layout is responsive and functional
`,
  playwright: (m) => `// ${m} compatibility tests — NFR fixtures
import { test, expect } from '@playwright/test';

test.describe('${m} cross-browser compatibility', () => {
  // LLM_FILL: define target browsers and viewports

  test('renders correctly across browsers', async ({ browser }) => {
    // LLM_FILL: iterate browsers and verify rendering
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.goto('/${m}');
    await expect(page.locator('body')).toBeVisible();
    await context.close();
  });

  test('responsive layout on mobile', async ({ browser }) => {
    // LLM_FILL: verify mobile layout
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.goto('/${m}');
    await expect(page.locator('body')).toBeVisible();
    await context.close();
  });
});
`,
};
