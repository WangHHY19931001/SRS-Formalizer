/**
 * NFR (Non-Functional Requirement) fixture generator.
 * Six NFR categories aligned with types/srs-ir.ts NFRCategory.
 * Registry pattern: NFR_GENERATORS maps category × framework → generator fn.
 * All generated code includes LLM_FILL markers for semantic content.
 * Zero runtime dependencies.
 */

import type { NFRCategory } from '../../../types/srs-ir.js';
import type { Framework, GeneratorFn } from './types.js';
import { performance } from './performance.js';
import { security } from './security.js';
import { availability } from './availability.js';
import { compatibility } from './compatibility.js';
import { maintainability } from './maintainability.js';
import { compliance } from './compliance.js';

const NFR_GENERATORS: Partial<Record<NFRCategory, Partial<Record<Framework, GeneratorFn>>>> = {
  performance,
  security,
  availability,
  compatibility,
  maintainability,
  compliance,
};

/**
 * Generate NFR test fixtures for a given category × framework combination.
 * Throws if no generator is registered for the combination.
 */
export function generateNfrFixtures(
  category: NFRCategory,
  framework: Framework,
  moduleName: string,
): string {
  const gen = NFR_GENERATORS[category]?.[framework];
  if (!gen) {
    throw new Error(`No NFR generator for category=${category}, framework=${framework}`);
  }
  return gen(moduleName);
}

/**
 * Check whether a given category × framework combination has a registered generator.
 */
export function supportsFramework(category: NFRCategory, framework: Framework): boolean {
  return !!(NFR_GENERATORS[category]?.[framework]);
}

/** List all frameworks that support a given NFR category */
export function supportedFrameworks(category: NFRCategory): Framework[] {
  return (Object.keys(NFR_GENERATORS[category] ?? {}) as Framework[]);
}
