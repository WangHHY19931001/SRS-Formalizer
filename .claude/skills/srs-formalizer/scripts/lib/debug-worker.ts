/**
 * debug-worker.ts — 调测工作者代理
 *
 * 编排者（debug-skill）分派工作者执行 LLM 子代理任务。
 * 工作者：接收提示词 → 发送到测试 LLM → 返回结果。
 *
 * 支持任务类型：
 *   - R1 显式需求提取
 *   - R2 隐式需求推导
 *   - R3 关系需求推导
 *   - arch 架构分解
 *   - BDD 充实
 *   - TLA+ 规约编写
 *   - Lean 4 证明编写
 *   - glossary 术语提取
 */

import OpenAI from 'openai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LlmConfig } from './llm-client.js';

// ===================== Types =====================

export interface WorkerTask {
  task_id: string;
  task_type: 'R1_extract' | 'R2_derive' | 'R3_relate' | 'arch_decompose' | 'bdd_enrich' | 'tla_spec' | 'lean_proof' | 'glossary_extract';
  prompt: string;
  output_path: string;
  max_retries?: number;
}

export interface WorkerResult {
  task_id: string;
  status: 'ok' | 'error' | 'retry';
  output: string;
  duration_ms: number;
  retry_count: number;
  error?: string;
  validation?: { valid: boolean; errors: string[]; warnings: string[] };
}

// ===================== Worker =====================

export class DebugWorker {
  private client: OpenAI;
  private model: string;
  private maxRetries: number;

  constructor(config: LlmConfig, maxRetries = 2) {
    this.client = new OpenAI({ baseURL: config.baseURL, apiKey: config.key });
    this.model = config.name;
    this.maxRetries = maxRetries;
  }

  async execute(task: WorkerTask): Promise<WorkerResult> {
    const start = Date.now();
    let retries = 0;
    let lastOutput = '';
    let lastError = '';

    while (retries <= (task.max_retries ?? this.maxRetries)) {
      try {
        const resp = await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: task.prompt }],
          max_tokens: 4096,
          temperature: 0.1,
        });

        const msg = resp.choices[0]?.message as Record<string, unknown> | undefined;
        lastOutput = (msg?.content as string) || (msg?.reasoning_content as string) || (msg?.reasoning as string) || '';

        // If reasoning model: extract actual answer from thinking
        if (!msg?.content && (msg?.reasoning || msg?.reasoning_content)) {
          lastOutput = extractAnswerFromReasoning(lastOutput);
        }

        // Write output
        if (task.output_path) {
          const dir = path.dirname(task.output_path);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(task.output_path, lastOutput, 'utf-8');
        }

        return {
          task_id: task.task_id,
          status: 'ok',
          output: lastOutput,
          duration_ms: Date.now() - start,
          retry_count: retries,
        };
      } catch (err) {
        lastError = (err as Error).message;
        retries++;
        if (retries > (task.max_retries ?? this.maxRetries)) {
          return {
            task_id: task.task_id,
            status: 'error',
            output: lastOutput,
            duration_ms: Date.now() - start,
            retry_count: retries,
            error: lastError,
          };
        }
      }
    }

    return {
      task_id: task.task_id,
      status: 'error',
      output: lastOutput,
      duration_ms: Date.now() - start,
      retry_count: retries,
      error: lastError,
    };
  }

  /**
   * Execute multiple tasks sequentially (for S2 batch processing).
   */
  async executeBatch(tasks: WorkerTask[], onProgress?: (done: number, total: number, taskId: string, status: string) => void): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const result = await this.execute(tasks[i]!);
      results.push(result);
      onProgress?.(i + 1, tasks.length, tasks[i]!.task_id, result.status);
    }
    return results;
  }

  /**
   * Validate worker output against expected format.
   */
  validate(taskType: WorkerTask['task_type'], output: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!output.trim()) {
      errors.push('Empty output');
    }

    switch (taskType) {
      case 'R1_extract':
      case 'R2_derive':
      case 'R3_relate': {
        // Should be JSONL — at least one valid JSON line
        const lines = output.split('\n').filter(l => l.trim());
        const validLines = lines.filter(l => {
          try { const p = JSON.parse(l); return typeof p === 'object' && p !== null; } catch { return false; }
        });
        if (validLines.length === 0) errors.push('No valid JSONL lines found');
        if (lines.length > validLines.length) warnings.push(`${lines.length - validLines.length} non-JSONL lines`);
        if (output.includes('sorry')) errors.push('Contains "sorry" placeholder');
        break;
      }
      case 'tla_spec':
        if (!output.includes('MODULE')) errors.push('Missing MODULE declaration');
        if (!output.includes('==')) errors.push('No action definitions (==) found');
        break;
      case 'lean_proof':
        if (output.includes('sorry')) errors.push('Contains "sorry" placeholder');
        if (!output.includes('theorem') && !output.includes('lemma')) warnings.push('No theorem/lemma found');
        break;
      case 'glossary_extract':
        try {
          const parsed = JSON.parse(output);
          if (!parsed.terms || !Array.isArray(parsed.terms)) errors.push('Missing terms array');
        } catch { errors.push('Not valid JSON'); }
        break;
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

// ===================== Reasoning Extraction =====================

function extractAnswerFromReasoning(raw: string): string {
  if (!raw) return '';
  // Try last code block
  const codeBlocks = raw.match(/```[\s\S]*?```/g);
  if (codeBlocks && codeBlocks.length > 0) {
    const last = codeBlocks[codeBlocks.length - 1]!;
    return last.replace(/```\w*\n?/g, '').replace(/```$/, '').trim();
  }
  // Take last 40% of content (reasoning typically first 60%)
  const lines = raw.split('\n');
  const start = Math.floor(lines.length * 0.6);
  return lines.slice(start).join('\n').trim();
}
