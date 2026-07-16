/**
 * BDD feature-file parser.
 */

import * as fs from 'node:fs';

export interface ParsedScenario {
  name: string;
  requirementRefs: string[];
  givens: string[];
  whens: string[];
  thens: string[];
  rawText: string;
}

export interface ParsedFeature {
  name: string;
  system: string;
  trace: string;
  scenarios: ParsedScenario[];
}

export function parseFeatureFile(filePath: string): ParsedFeature | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  let system = '';
  let trace = '';
  let featureName = '';
  const scenarios: ParsedScenario[] = [];
  let currentScenario: ParsedScenario | null = null;
  let currentSection: 'given' | 'when' | 'then' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Header comments
    if (trimmed.startsWith('# SYSTEM:')) system = trimmed.replace('# SYSTEM:', '').trim();
    if (trimmed.startsWith('# TRACE:')) trace = trimmed.replace('# TRACE:', '').trim();

    // Feature declaration
    if (trimmed.startsWith('Feature:')) {
      featureName = trimmed.replace('Feature:', '').trim();
    }

    // Scenario declaration
    if (trimmed.startsWith('Scenario:')) {
      if (currentScenario) scenarios.push(currentScenario);
      currentScenario = {
        name: trimmed.replace('Scenario:', '').trim(),
        requirementRefs: [],
        givens: [],
        whens: [],
        thens: [],
        rawText: '',
      };
      currentSection = null;
      continue;
    }

    if (!currentScenario) continue;

    // Collect requirement refs from comments
    if (trimmed.startsWith('# verification:')) {
      const refs = trimmed.replace('# verification:', '').trim().split(',').map(s => s.trim());
      currentScenario.requirementRefs.push(...refs);
      continue;
    }

    // Step detection
    const givenMatch = trimmed.match(/^Given\s+(.+)/);
    const whenMatch = trimmed.match(/^When\s+(.+)/);
    const thenMatch = trimmed.match(/^Then\s+(.+)/);

    if (givenMatch) { currentSection = 'given'; currentScenario.givens.push(givenMatch[1]!); continue; }
    if (whenMatch) { currentSection = 'when'; currentScenario.whens.push(whenMatch[1]!); continue; }
    if (thenMatch) { currentSection = 'then'; currentScenario.thens.push(thenMatch[1]!); continue; }

    // Continuation lines for multi-line steps
    if (currentSection && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('Feature:') && !trimmed.startsWith('Scenario:')) {
      const arr = currentSection === 'given' ? currentScenario.givens
        : currentSection === 'when' ? currentScenario.whens
        : currentScenario.thens;
      if (arr.length > 0) {
        arr[arr.length - 1] += ' ' + trimmed;
      }
    }
  }

  if (currentScenario) scenarios.push(currentScenario);

  if (!featureName) return null;
  return { name: featureName, system, trace, scenarios };
}
