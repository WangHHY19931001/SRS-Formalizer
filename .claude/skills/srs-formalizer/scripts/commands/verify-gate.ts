/**
 * verify-gate.ts -- 验证关卡命令 (SRS §5.13)
 *
 * CLI: npx tsx index.ts verify-gate --workdir .srs_formalizer --stage S1|R3|FINAL
 *
 * 根据 --stage 执行不同阶段的验证检查：
 * - S1:   基础检查（STATE.md、index.json、r1-explicit JSONL 文件存在）
 * - R3:   S1 检查 + JSONL 存在性（全子目录）、ID 唯一性、图谱可加载、节点数 >= R1 数、
 *         分层深度闸门（架构树非平铺、深度 >= 2）、孤儿裁决闸门（orphan_adjudications.json）
 * - FINAL: R3 检查 + BDD/TLA+/Lean verified 产物存在且匹配当前内容 sourceHash 的成功验证报告
 *         （Lean 仅在 IR 标记 security/compliance NFR 时必选）；详见 checkFormalArtifacts。
 */

import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { checkStateMd, checkShardIndex, checkR1HasJsonlFiles, checkShardCompleteness, checkShardCoverage, checkGlossaryExists, checkDataFlowFormat } from '../lib/verify-gate/checks-s1.js';
import { checkAllJsonlDirsHaveFiles, checkArchitectureExists, checkIdUniqueness, checkGraphLoadable, checkGraphEdgeIntegrity, checkNodeCountVsR1, checkOrphanRatio, checkHierarchyDepth, checkOrphanAdjudication, checkAtomicTree, checkEdgeTypeDiversity, checkContainsEdgeDirection, checkR2R3Ingest } from '../lib/verify-gate/checks-r3.js';
import { checkFormalArtifacts, verifiedArtifactCheck, tlaVerifiedCheck, leanVerifiedCheck } from '../lib/verify-gate/checks-final.js';
import { checkFidelityReport, checkSafetyCriticalCoverage } from '../lib/verify-gate/checks-fidelity.js';
import { VALID_STAGES, checkChecklistComplete, checkStateMdCrossCheck, type CheckResult, type VerifyOutput } from '../lib/verify-gate/shared.js';

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
  allChecks.push(checkShardCoverage(workDir));
  allChecks.push(checkGlossaryExists(workDir));
  allChecks.push(checkDataFlowFormat(workDir));

  // === Stage checklist gates (S1/R3/FINAL) ===
  if (stageArg === 'S1' || stageArg === 'R3' || stageArg === 'FINAL') {
    allChecks.push(checkChecklistComplete('S0', workDir));
  }
  if (stageArg === 'R3' || stageArg === 'FINAL') {
    allChecks.push(checkChecklistComplete('2_extract', workDir));
    allChecks.push(checkChecklistComplete('3_graph', workDir));
    // P1-11: STATE.md cross-validation (R3/FINAL only — S1 is initial stage, fields not yet populated)
    allChecks.push(checkStateMdCrossCheck(workDir));
  }

  // === R3 / FINAL additional checks ===
  if (stageArg !== 'S1') {
    allChecks.push(checkAllJsonlDirsHaveFiles(workDir));
    allChecks.push(checkArchitectureExists(workDir));
    allChecks.push(checkIdUniqueness(workDir));
    allChecks.push(checkGraphLoadable(workDir));
    allChecks.push(checkGraphEdgeIntegrity(workDir));
    allChecks.push(checkOrphanRatio(workDir));
    allChecks.push(checkNodeCountVsR1(workDir));
    allChecks.push(checkHierarchyDepth(workDir));
    allChecks.push(checkOrphanAdjudication(workDir));
    allChecks.push(checkAtomicTree(workDir));
    allChecks.push(checkEdgeTypeDiversity(workDir));
    allChecks.push(checkContainsEdgeDirection(workDir));
    allChecks.push(checkR2R3Ingest(workDir));
  }

  // === Backend stage gates (B2/B3/B4) — P0-1 ===
  // Each Backend stage gets its own checkpoint instead of waiting for FINAL.
  // FINAL stage uses checkFormalArtifacts() below for unified coverage.
  // B2: BDD verified artifacts exist and match sourceHash
  if (stageArg === 'B2') {
    allChecks.push(verifiedArtifactCheck(workDir, 'bdd', true));
  }
  // B3: TLA+ verified artifacts (module set coverage checked at FINAL)
  if (stageArg === 'B3') {
    allChecks.push(tlaVerifiedCheck(workDir));
  }
  // B4: Lean4 verified artifacts (only if security/compliance NFR present)
  if (stageArg === 'B4') {
    allChecks.push(leanVerifiedCheck(workDir));
  }

  // === FINAL-only checks ===
  if (stageArg === 'FINAL') {
    allChecks.push(...checkFormalArtifacts(workDir));
    allChecks.push(checkFidelityReport(workDir));
    allChecks.push(checkSafetyCriticalCoverage(workDir));
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
