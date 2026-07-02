/**
 * llm-config.ts — LLM configuration loader (agent directory)
 *
 * Reads OpenAI-compatible LLM config from a JSON file.
 * Independent of the srs-formalizer skill directory.
 */

import * as fs from 'node:fs';

export interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
}

export interface LlmConfig {
  name: string;
  api_type: 'openai-compatible';
  baseURL: string;
  key: string;
  'max-model-len': number;
  description?: string;
  mcp_servers?: McpServerEntry[];
}

export function loadLlmConfig(configPath: string): LlmConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw) as LlmConfig;
  if (config.api_type !== 'openai-compatible') {
    throw new Error(`Unsupported api_type: ${config.api_type}. Only "openai-compatible" is supported.`);
  }
  return config;
}
