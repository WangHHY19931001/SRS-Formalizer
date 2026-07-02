/**
 * llm-client.ts — OpenAI-compatible LLM client for capability-probe testing
 *
 * Reads test-llm-config.json and sends prompts to any OpenAI-compatible API.
 * Used by the test-probes command for automated test→fix→regression loops.
 */

import OpenAI from 'openai';
import * as fs from 'node:fs';

// ===================== Types =====================

export interface LlmConfig {
  name: string;
  api_type: 'openai-compatible';
  baseURL: string;
  key: string;
  'max-model-len': number;
  description?: string;
}

export interface ProbeResult {
  probe_id: string;
  dimension: string;
  prompt: string;
  answer: string;
  duration_ms: number;
  error?: string;
}

// ===================== Client =====================

export function loadLlmConfig(configPath: string): LlmConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw) as LlmConfig;
  if (config.api_type !== 'openai-compatible') {
    throw new Error(`Unsupported api_type: ${config.api_type}. Only "openai-compatible" is supported.`);
  }
  return config;
}

/**
 * Send a batch of prompts to the LLM and collect answers.
 * Returns results in the same order as input probes.
 */
export async function sendProbes(
  config: LlmConfig,
  probes: Array<{ probe_id: string; dimension: string; prompt: string }>,
  onProgress?: (index: number, total: number, probeId: string, status: string) => void,
): Promise<ProbeResult[]> {
  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.key,
  });

  const results: ProbeResult[] = [];

  for (let i = 0; i < probes.length; i++) {
    const probe = probes[i]!;
    const start = Date.now();

    try {
      const resp = await client.chat.completions.create({
        model: config.name,
        messages: [{ role: 'user', content: probe.prompt }],
        max_tokens: 2048,
        temperature: 0.1,
      });

      // Reasoning models (Qwen3.5, DeepSeek-R1) put output in reasoning/reasoning_content
      // and leave content=null. Extract the actual answer from the reasoning text:
      // prefer content > reasoning_content > reasoning, then strip thinking noise.
      const msg = resp.choices[0]?.message as Record<string, unknown> | undefined;
      const raw = (msg?.content as string)
        || (msg?.reasoning_content as string)
        || (msg?.reasoning as string)
        || '';
      // If reasoning-only model: extract final answer from thinking process.
      // Heuristic: last markdown code block, or everything after last "Final Answer:" marker.
      const answer = extractAnswer(raw);
      results.push({
        probe_id: probe.probe_id,
        dimension: probe.dimension,
        prompt: probe.prompt,
        answer,
        duration_ms: Date.now() - start,
      });
      onProgress?.(i, probes.length, probe.probe_id, 'OK');
    } catch (err) {
      results.push({
        probe_id: probe.probe_id,
        dimension: probe.dimension,
        prompt: probe.prompt,
        answer: '',
        duration_ms: Date.now() - start,
        error: (err as Error).message,
      });
      onProgress?.(i, probes.length, probe.probe_id, `FAIL: ${(err as Error).message}`);
    }
  }

  return results;
}

/**
 * Convert ProbeResult array to the { answers: { probe_id: string } } format
 * expected by capability-probe --mode score.
 */
/**
 * Extract the actual answer from a reasoning model's output.
 * Reasoning models (Qwen3.5, DeepSeek-R1) output thinking process *before* the answer.
 * We try: last ``` code block > everything after "Final Answer:" > last 40% of text.
 */
function extractAnswer(raw: string): string {
  if (!raw) return '';

  // If there's no thinking noise, return as-is
  if (!raw.includes('Thinking Process') && !raw.includes('Analyze the Request') && !raw.match(/^\d+\.\s+\*\*/m)) {
    return raw;
  }

  // Try last markdown code block (```json ... ``` or ``` ... ```)
  const codeBlocks = raw.match(/```[\s\S]*?```/g);
  if (codeBlocks && codeBlocks.length > 0) {
    const last = codeBlocks[codeBlocks.length - 1]!;
    return last.replace(/```\w*\n?/g, '').replace(/```$/, '').trim();
  }

  // Try "Final Answer:" marker
  const finalIdx = raw.lastIndexOf('Final Answer');
  if (finalIdx > 0) {
    return raw.slice(finalIdx).replace(/^Final Answer[:\s]*/i, '').trim();
  }

  // Fallback: take the last ~40% of the text (reasoning is typically first 60%)
  const lines = raw.split('\n');
  const start = Math.floor(lines.length * 0.6);
  return lines.slice(start).join('\n').trim();
}

export function toAnswerFile(results: ProbeResult[]): { answers: Record<string, string> } {
  const answers: Record<string, string> = {};
  for (const r of results) {
    answers[r.probe_id] = r.answer;
  }
  return { answers };
}
