/**
 * Stability types and internal helpers for cross-LLM stability testing.
 */

import type { CapabilityProfile, Dimension } from '../../probe/types.js';
import type { LlmProviderConfig } from '../config.js';
import type { StabilityTestConfig } from '../config.js';

export { type StabilityTestConfig, type LlmProviderConfig };

export const ALL_DIMENSIONS: Dimension[] = [
  'instruction_following',
  'structured_output',
  'precision',
  'hierarchical_reasoning',
  'logical_reasoning',
  'creative_reasoning',
  'formal_tlaplus',
  'formal_lean4',
];

export function getDim(p: CapabilityProfile, dim: Dimension): number {
  return (p as unknown as Record<string, number>)[dim] ?? 0;
}

export function setDim(p: Record<string, number>, dim: Dimension, val: number): void {
  p[dim] = val;
}

export function toDimRecord(source: Record<string, number>): Record<Dimension, number> {
  return source as unknown as Record<Dimension, number>;
}

// ─── Orchestrator Manifest Types ─────────────────────────────────────────

export interface PromptManifest {
  manifestId: string;
  provider: LlmProviderConfig;
  pass: number;
  prompts: Record<string, string>;
  outputFormat: 'json' | 'text';
}

export interface StabilityScoreManifest {
  answersDir: string;
  expectedFiles: number;
}

// ─── Results Types ───────────────────────────────────────────────────────

export interface StabilityResults {
  answersDir: string;
  totalEvaluations: number;
  providerProfiles: Record<string, CapabilityProfile[]>;
  intraModelSigma: Record<string, Record<Dimension, number>>;
  interModelDelta: Array<{
    providerA: string;
    providerB: string;
    deltas: Record<Dimension, number>;
    avgDelta: number;
  }>;
  overallScore: number;
}
