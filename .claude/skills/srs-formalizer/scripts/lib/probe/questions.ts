/**
 * questions.ts — Probe generation for the capability probe system
 *
 * This file aggregates probes from per-dimension files in the questions/ directory.
 * All 50 probes across 8 dimensions are always generated. Toolchain availability
 * affects only scoring mode (actual runtime vs syntactic fallback), not probe set.
 */

import type { ProbeItem } from './types.js';
import { generateInstructionFollowingProbes } from './questions/instruction-following.js';
import { generateStructuredOutputProbes } from './questions/structured-output.js';
import { generatePrecisionProbes } from './questions/precision.js';
import { generateCreativeReasoningProbes } from './questions/creative.js';
import { generateHierarchicalReasoningProbes } from './questions/hierarchical.js';
import { generateLogicalReasoningProbes } from './questions/logical.js';
import { generateTlaPlusProbes } from './questions/tlaplus.js';
import { generateLean4Probes } from './questions/lean4.js';
import { detectTlaPlusToolchain } from './scorer/tlaplus.js';
import { detectLean4Toolchain } from './scorer/lean4.js';

export interface ProbeGenerationResult {
  probes: ProbeItem[];
  dimensions: string[];
  skipped: string[];
  total: number;
}

export function generateProbes(): ProbeItem[] {
  const probes: ProbeItem[] = [
    ...generateInstructionFollowingProbes(),
    ...generateStructuredOutputProbes(),
    ...generatePrecisionProbes(),
    ...generateHierarchicalReasoningProbes(),
    ...generateLogicalReasoningProbes(),
    ...generateCreativeReasoningProbes(),
    ...generateTlaPlusProbes(),
    ...generateLean4Probes(),
  ];

  return probes;
}

export function generateProbesWithMeta(): ProbeGenerationResult {
  const dimensions: string[] = [
    'instruction_following',
    'structured_output',
    'precision',
    'hierarchical_reasoning',
    'logical_reasoning',
    'creative_reasoning',
    'formal_tlaplus',
    'formal_lean4',
  ];
  const skipped: string[] = [];

  const tlaOk = detectTlaPlusToolchain();
  const leanOk = detectLean4Toolchain();

  if (!tlaOk) { skipped.push('formal_tlaplus'); }
  if (!leanOk) { skipped.push('formal_lean4'); }

  return {
    probes: generateProbes(),
    dimensions,
    skipped,
    total: 8,
  };
}
