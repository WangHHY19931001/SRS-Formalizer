/**
 * Template engine for fixture generation.
 * Loads .template files and renders {{var}} placeholders.
 * Zero dependencies — uses TS string replace.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const TEMPLATES_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..', '..', 'templates', 'test-fixtures',
);

/**
 * Load a template file by framework and name.
 * @param framework - e.g. 'cucumber', 'playwright', 'pytest', 'junit', 'fast-check', 'nfr'
 * @param templateName - e.g. 'steps.ts', 'world.ts', 'test_module.py'
 * @returns template content string
 */
export function loadTemplate(framework: string, templateName: string): string {
  const filePath = path.join(TEMPLATES_DIR, framework, templateName + '.template');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${framework}/${templateName}.template`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Render a template by replacing {{VAR}} placeholders.
 * Unmatched placeholders are left as-is.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
