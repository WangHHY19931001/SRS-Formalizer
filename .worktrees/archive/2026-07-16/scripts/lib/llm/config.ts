/**
 * config.ts — LLM Provider Configuration for cross-LLM stability testing
 *
 * Defines the provider config interface and a helper to load config from JSON.
 */

import * as fs from 'node:fs';

export interface LlmProviderConfig {
  id: string;
  /** Human-readable name, e.g. "Claude Opus 4.8" */
  name: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  model: string;
  endpoint?: string;
  temperature?: number;
  /** Max tokens per response */
  maxTokens?: number;
}

export interface StabilityTestConfig {
  providers: LlmProviderConfig[];
  /** Number of passes per provider (default 3) */
  passes?: number;
  /** Output directory for results */
  outputDir?: string;
}

/**
 * Load StabilityTestConfig from a JSON file path.
 * Performs minimal validation on required fields.
 */
export function loadStabilityConfig(configPath: string): StabilityTestConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read config file: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Config file is not valid JSON');
  }

  const cfg = parsed as Record<string, unknown>;

  if (!Array.isArray(cfg.providers) || cfg.providers.length === 0) {
    throw new Error('Config must contain a non-empty "providers" array');
  }

  for (const p of cfg.providers) {
    const provider = p as Record<string, unknown>;
    if (typeof provider.id !== 'string' || typeof provider.name !== 'string' || typeof provider.model !== 'string') {
      throw new Error(`Each provider must have "id", "name", and "model" as strings`);
    }
    if (!['openai', 'anthropic', 'gemini', 'custom'].includes(provider.provider as string)) {
      throw new Error(`Unknown provider type "${String(provider.provider)}" for provider "${String(provider.name)}"`);
    }
  }

  const config: StabilityTestConfig = {
    providers: cfg.providers as LlmProviderConfig[],
    passes: typeof cfg.passes === 'number' ? cfg.passes : 3,
  };

  if (typeof cfg.outputDir === 'string') {
    config.outputDir = cfg.outputDir;
  }

  return config;
}
