/**
 * questions.ts — Probe generation for the capability probe system
 *
 * This file aggregates probes from per-dimension files in the questions/ directory.
 * TLA+ and Lean 4 probes are conditionally included — only when their required
 * toolchains (Java + tla2tools.jar for TLA+, lake for Lean 4) are available.
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
  /** Dimensions included */
  dimensions: string[];
  /** Dimensions skipped due to missing toolchain */
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
  ];

  if (detectTlaPlusToolchain()) {
    probes.push(...generateTlaPlusProbes());
  }
  if (detectLean4Toolchain()) {
    probes.push(...generateLean4Probes());
  }

  return probes;
}

/** Generate probes with toolchain-awareness, returning metadata about skipped dimensions */
export function generateProbesWithMeta(): ProbeGenerationResult {
  const dimensions: string[] = [
    'instruction_following',
    'structured_output',
    'precision',
    'hierarchical_reasoning',
    'logical_reasoning',
    'creative_reasoning',
  ];
  const skipped: string[] = [];

  const tlaOk = detectTlaPlusToolchain();
  const leanOk = detectLean4Toolchain();

  if (tlaOk) { dimensions.push('formal_tlaplus'); }
  else { skipped.push('formal_tlaplus'); }

  if (leanOk) { dimensions.push('formal_lean4'); }
  else { skipped.push('formal_lean4'); }

  return {
    probes: generateProbes(),
    dimensions,
    skipped,
    total: 6 + (tlaOk ? 1 : 0) + (leanOk ? 1 : 0),
  };
}
