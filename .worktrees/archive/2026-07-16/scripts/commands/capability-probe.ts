/**
 * capability-probe.ts — 能力探测评估系统
 *
 * CLI: npx tsx index.ts capability-probe --workdir <path> [--mode generate|score [--file <path>]]
 *
 * 功能：
 *   --mode generate : 输出一组标准化评估题（JSON 数组），编排者将其作为 LLM prompt
 *   --mode score --file <llm_answer.json> : 读取 LLM 回答，逐题判分，输出能力画像
 *
 * 8 个评估维度：
 *   instruction_following  | JSONL 格式遵循度
 *   structured_output      | 非规范化文本 → 合法 JSONL
 *   precision              | 区分真实需求与编造需求
 *   hierarchical_reasoning | 需求归类到模块
 *   logical_reasoning      | 推导 DEPENDS_ON 关系
 *   creative_reasoning     | 推导隐式需求
 *   formal_tlaplus         | TLA+ 形式化规约能力
 *   formal_lean4           | Lean 4 定理证明能力
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';
import { generateProbes, generateProbesWithMeta } from '../lib/probe/questions.js';
import { scoreAllProbes, calculateProfile } from '../lib/probe/scorer.js';

export async function main(args: string[]): Promise<CliResult> {
  let mode: string | null;
  let filePath: string | null;
  let tempDir: string | undefined;
  try {
    mode = safeParseArg(args, '--mode');
    filePath = safeParseArg(args, '--file');
    tempDir = safeParseArg(args, '--temp-dir') ?? undefined;
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!mode) {
    return { status: 'error', message: 'Missing required argument: --mode (generate|score)' };
  }

  if (mode === 'generate') {
    const result = generateProbesWithMeta();
    return {
      status: 'ok',
      data: result.probes,
      message: result.skipped.length > 0
        ? `工具链不可用，已跳过 ${result.skipped.join(', ')} 维度。实际考察 ${result.dimensions.length} 个维度，共 ${result.probes.length} 题。`
        : `${result.dimensions.length} 个维度，共 ${result.probes.length} 题。`,
    };
  }

  if (mode === 'score') {
    if (!filePath) {
      return { status: 'error', message: 'Missing required argument: --file <path> (required for score mode)' };
    }

    const workDir = tempDir ?? fs.mkdtempSync('capability-probe-');

    // Read answer file
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      return { status: 'error', message: `无法读取答案文件: ${(err as Error).message}` };
    }

    let answerData: { answers?: Record<string, string> };
    try {
      answerData = JSON.parse(raw) as { answers?: Record<string, string> };
    } catch {
      return { status: 'error', message: '答案文件不是合法的 JSON' };
    }

    const answers = answerData.answers ?? {};
    const probes = generateProbes();
    const probeResults = scoreAllProbes(probes, answers, workDir);
    const { profile, tier, recommendations } = calculateProfile(probeResults);

    return {
      status: 'ok',
      data: {
        probe_results: probeResults,
        capability_profile: profile,
        estimated_tier: tier,
        recommendations,
      },
    };
  }

  return { status: 'error', message: `Unknown mode: ${mode}. Use --mode generate or --mode score` };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
