/**
 * Shared types and helpers for NFR fixture generators.
 * Framework identifiers, generator function type, and the classify() helper
 * used by template strings across all NFR category files.
 */

import type { NFRCategory } from '../../../types/srs-ir.js';

export type { NFRCategory };

export type Framework = 'pytest' | 'junit' | 'cucumber' | 'playwright' | 'fast-check';

export type GeneratorFn = (moduleName: string) => string;

export function classify(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/[^\w]/g, '');
}
