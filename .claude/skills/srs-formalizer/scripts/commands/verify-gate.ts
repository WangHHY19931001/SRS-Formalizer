/**
 * verify-gate.ts -- 验证关卡命令 (SRS §5.13)
 *
 * CLI: npx tsx index.ts verify-gate --workdir .srs_formalizer --stage S1|R3|FINAL
 *
 * 根据 --stage 执行不同阶段的验证检查：
 * - S1:   基础检查（STATE.md、index.json、r1-explicit JSONL 文件存在）
 * - R3:   S1 检查 + JSONL 存在性（全子目录）、ID 唯一性、图谱可加载、节点数 >= R1 数
 * - FINAL: R3 检查 + validate-bdd 通过、graph.merged.json 存在、schema.cypher 存在、
 *         brainstorm_context.json 存在、MINDMAP.md 全部模块 ✅
 */

import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { checkStateMd, checkShardIndex, checkR1HasJsonlFiles, checkShardCompleteness, checkGlossaryExists } from '../lib/verify-gate/checks-s1.js';
import { checkAllJsonlDirsHaveFiles, checkArchitectureExists, checkIdUniqueness, checkGraphLoadable, checkGraphEdgeIntegrity, checkNodeCountVsR1 } from '../lib/verify-gate/checks-r3.js';
import { checkFormalArtifacts } from '../lib/verify-gate/checks-final.js';
import { VALID_STAGES, checkChecklistComplete, type CheckResult, type VerifyOutput } from '../lib/verify-gate/shared.js';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let stageArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    stageArg = safeParseArg(args, '--stage');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  if (!stageArg) {
    return { status: 'error', message: 'Missing required argument: --stage' };
  }

  if (!(VALID_STAGES as readonly string[]).includes(stageArg)) {
    return {
      status: 'error',
      message: `Invalid --stage: "${stageArg}". Valid values: ${VALID_STAGES.join(', ')}`,
    };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const allChecks: CheckResult[] = [];

  // === S1 checks (always run) ===
  allChecks.push(checkStateMd(workDir));
  allChecks.push(checkShardIndex(workDir));
  allChecks.push(checkR1HasJsonlFiles(workDir));
  allChecks.push(checkShardCompleteness(workDir));
  allChecks.push(checkGlossaryExists(workDir));

  // === Stage checklist gates (S1/R3/FINAL) ===
  if (stageArg === 'S1' || stageArg === 'R3' || stageArg === 'FINAL') {
    allChecks.push(checkChecklistComplete('S0', workDir));
  }
  if (stageArg === 'R3' || stageArg === 'FINAL') {
    allChecks.push(checkChecklistComplete('2_extract', workDir));
    allChecks.push(checkChecklistComplete('3_graph', workDir));
  }

  // === R3 / FINAL additional checks ===
  if (stageArg !== 'S1') {
    allChecks.push(checkAllJsonlDirsHaveFiles(workDir));
    allChecks.push(checkArchitectureExists(workDir));
    allChecks.push(checkIdUniqueness(workDir));
    allChecks.push(checkGraphLoadable(workDir));
    allChecks.push(checkGraphEdgeIntegrity(workDir));
    allChecks.push(checkNodeCountVsR1(workDir));
  }

  // === FINAL-only checks ===
  if (stageArg === 'FINAL') {
    allChecks.push(...checkFormalArtifacts(workDir));
  }

  const errors = allChecks.filter(c => !c.passed).map(c => c.detail ?? c.name);
  const allPassed = errors.length === 0;

  const output: VerifyOutput = {
    pass: allPassed,
    checks: Object.fromEntries(allChecks.map(c => [c.name, { passed: c.passed, detail: c.detail }])),
    errors,
  };

  return { status: stageArg === 'FINAL' && !allPassed ? 'error' : 'ok', data: output, ...(stageArg === 'FINAL' && !allPassed ? { message: 'Verification gate failed' } : {}) };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
