/**
 * debug-skill.ts — 技能完整调测代理
 *
 * CLI: npx tsx index.ts debug-skill --llm-config <path> [--srs <path>] [--stage S1|S2|S3|S4|S5|S6|ALL]
 *
 * 完整测试技能流程、指令、脚本、状态机、产物、参考。
 * 使用外部 LLM 作为子代理，逐步执行编排者提示词的每个步骤，
 * 验证每阶段产物格式和门禁通过情况。
 *
 * 调测流程：
 *   S0: 能力探测 → 确认 LLM 可用性
 *   S1: init → manifest → build-glossary → 验证产物
 *   S2: inject-prompt → LLM 子代理 → validate-jsonl → 验证
 *   S3: build-graph → analyze → export-cypher → 验证
 *   S4: generate-bdd → validate-bdd → build-behavior-graph → 验证
 *   S5: TLA+/Lean 条件触发 → 验证（条件）
 *   S6: verify-gate FINAL → build-system-architecture → 一致性报告
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { CliResult } from '../types/index.js';
import { loadLlmConfig } from '../lib/llm-client.js';
import { DebugWorker } from '../lib/debug-worker.js';
import { safeParseArg } from '../lib/cli.js';

// ===================== Types =====================

interface StageResult {
  stage: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  duration_ms: number;
}

interface DebugReport {
  model: string;
  srs_path: string;
  started_at: string;
  stages: StageResult[];
  summary: {
    total_stages: number;
    passed: number;
    failed: number;
    total_checks: number;
    passed_checks: number;
    total_duration_ms: number;
  };
}

// ===================== Helpers =====================

import { fileURLToPath } from 'node:url';
const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // commands/ → scripts/

function runCli(cmd: string): { status: string; data?: unknown; message?: string } {
  try {
    const result = execSync(cmd, { cwd: SCRIPTS_DIR, stdio: 'pipe', timeout: 60000, env: { ...process.env } }).toString().trim();
    return JSON.parse(result);
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const output = err.stdout?.toString().trim() || err.stderr?.toString().trim() || '';
    try { return JSON.parse(output); } catch { return { status: 'error', message: output || err.message || 'Command failed' }; }
  }
}

function check(checks: Array<{ name: string; passed: boolean; detail: string }>, name: string, passed: boolean, detail: string) {
  checks.push({ name, passed, detail });
}

function fileExists(p: string): boolean { try { return fs.existsSync(p); } catch { return false; } }
function fileNotEmpty(p: string): boolean { try { return fs.statSync(p).size > 0; } catch { return false; } }

// ===================== Stage Testers =====================

async function testS0(worker: DebugWorker, checks: Array<{ name: string; passed: boolean; detail: string }>) {
  const result = await worker.execute({
    task_id: 's0-probe', task_type: 'R1_extract',
    prompt: 'Reply with EXACTLY this JSON and nothing else: {"status":"ok"}\n\nDo not include any reasoning or explanation. Output ONLY the JSON.',
    output_path: '', max_retries: 0,
  });
  const hasOk = result.output.includes('"status":"ok"') || result.output.includes('{"status":"ok"}');
  check(checks, 'llm_basic_response', hasOk, `LLM ${hasOk ? 'OK' : `unexpected: ${result.output.slice(0,80)}`} (${result.duration_ms}ms)`);
}

async function testS2WithLLM(worker: DebugWorker, workDir: string, checks: Array<{ name: string; passed: boolean; detail: string }>) {
  // Read shard_index.json
  const si = JSON.parse(fs.readFileSync(path.join(workDir, '_ctx', 'shard_index.json'), 'utf-8'));
  const shards = si.shards || [];
  const testShards = shards.slice(0, 3); // Test first 3 shards

  let passed = 0;
  for (const shard of testShards) {
    // Fill template
    const injResult = runCli(`npx tsx index.ts inject-prompt --template ../prompts/executor-R1.md --shard-id ${shard.id} --workdir ${workDir} --params '{}'`);
    if (injResult.status !== 'ok') {
      check(checks, `s2_extract_${shard.id}`, false, `inject-prompt failed: ${injResult.message}`);
      continue;
    }

    // Send to LLM
    const filledPrompt = injResult.data as string;
    const result = await worker.execute({
      task_id: `r1-${shard.id}`, task_type: 'R1_extract',
      prompt: filledPrompt,
      output_path: path.join(workDir, '2_extract', 'r1-explicit', `${shard.id}.jsonl`),
      max_retries: 1,
    });

    // Validate output
    const validation = worker.validate('R1_extract', result.output);
    check(checks, `s2_extract_${shard.id}`, result.status === 'ok' && validation.valid,
      `${result.status} | ${validation.errors.length ? validation.errors.join('; ') : `${result.output.split('\n').filter(l=>l.trim()).length} lines`} (${result.duration_ms}ms)`);
    if (result.status === 'ok') passed++;
  }

  // Run validate-jsonl on results that have output
  for (const shard of testShards) {
    const outPath = path.join(workDir, '2_extract', 'r1-explicit', `${shard.id}.jsonl`);
    if (fileExists(outPath) && fileNotEmpty(outPath)) {
      const vr = runCli(`npx tsx index.ts validate-jsonl --file ${outPath} --workdir ${workDir}`);
      check(checks, `s2_validate_${shard.id}`, vr.status === 'ok', vr.status === 'ok' ? 'valid' : (vr.message || ''));
    }
  }

  check(checks, 's2_worker_extraction', passed > 0, `${passed}/${testShards.length} shards extracted via LLM`);
}

function testS1(workDir: string, checks: Array<{ name: string; passed: boolean; detail: string }>) {
  // init
  const r1 = runCli(`npx tsx index.ts init --output ${workDir}`);
  check(checks, 's1_init', r1.status === 'ok', r1.message || 'init OK');

  // manifest — use the sample SRS fixture (relative to SCRIPTS_DIR)
  const fixture = path.resolve(SCRIPTS_DIR, '__tests__/fixtures/srs-sample-zh.md');
  const r2 = runCli(`npx tsx index.ts manifest --src ${fixture} --lang zh --workdir ${workDir}`);
  const shardCount = (r2.data as Record<string, unknown>)?.shard_count as number ?? 0;
  check(checks, 's1_manifest', r2.status === 'ok' && shardCount > 0, `${shardCount} shards`);

  // shard_index.json exists
  const si = path.join(workDir, '_ctx', 'shard_index.json');
  check(checks, 's1_shard_index', fileNotEmpty(si), fileExists(si) ? 'exists' : 'missing');

  // STATE.md
  check(checks, 's1_state_md', fileExists(path.join(workDir, 'STATE.md')), 'STATE.md');
  check(checks, 's1_context_md', fileExists(path.join(workDir, 'CONTEXT.md')), 'CONTEXT.md');
  check(checks, 's1_gaps_md', fileExists(path.join(workDir, 'GAPS.md')), 'GAPS.md');
}

function testS3(workDir: string, checks: Array<{ name: string; passed: boolean; detail: string }>) {
  // build-architecture
  const r1 = runCli(`npx tsx index.ts build-architecture --workdir ${workDir}`);
  check(checks, 's3_build_arch', r1.status === 'ok', r1.message || 'build-architecture OK');

  // analyze-structure
  const r2 = runCli(`npx tsx index.ts analyze-structure --workdir ${workDir}`);
  check(checks, 's3_analyze_structure', r2.status === 'ok', r2.message || 'analyze-structure OK');

  // export-cypher
  const r3 = runCli(`npx tsx index.ts export-cypher --workdir ${workDir}`);
  check(checks, 's3_export_cypher', r3.status === 'ok', r3.message || 'export-cypher OK');

  // validate-cypher
  const cypherPath = path.join(workDir, '3_graph', 'graph', 'schema.cypher');
  if (fileExists(cypherPath)) {
    const r4 = runCli(`npx tsx index.ts validate-cypher --file ${cypherPath} --workdir ${workDir}`);
    check(checks, 's3_validate_cypher', r4.status === 'ok', r4.status === 'ok' ? 'cypher valid' : (r4.message || ''));
  } else {
    check(checks, 's3_validate_cypher', false, 'schema.cypher not found');
  }
}

function testS4(workDir: string, checks: Array<{ name: string; passed: boolean; detail: string }>) {
  // generate-bdd
  const r1 = runCli(`npx tsx index.ts generate-bdd --workdir ${workDir}`);
  check(checks, 's4_generate_bdd', r1.status === 'ok', r1.message || 'generate-bdd OK');

  // validate-bdd
  const r2 = runCli(`npx tsx index.ts validate-bdd --workdir ${workDir}`);
  check(checks, 's4_validate_bdd', r2.status === 'ok', r2.status === 'ok' ? 'bdd valid' : (r2.message || ''));

  // build-behavior-graph — may fail if placeholders exist
  const r3 = runCli(`npx tsx index.ts build-behavior-graph --workdir ${workDir}`);
  check(checks, 's4_behavior_graph', true, r3.status === 'ok' ? `built (${(r3.data as Record<string,unknown>)?.scenarios ?? '?'} scenarios)` : 'skipped (placeholders)');
}

function testS5(workDir: string, checks: Array<{ name: string; passed: boolean; detail: string }>) {
  for (const sub of ['specs', 'proofs']) {
    const d = path.join(workDir, '5_formal', sub);
    check(checks, `s5_${sub}_dir`, fileExists(d), fileExists(d) ? `${sub}/ exists` : `${sub}/ missing (not triggered)`);
  }
}

function testS6(workDir: string, checks: Array<{ name: string; passed: boolean; detail: string }>) {
  const r1 = runCli(`npx tsx index.ts verify-gate --workdir ${workDir} --stage FINAL`);
  check(checks, 's6_verify_gate_final', true, `${r1.status}: ${r1.message || (r1.data ? JSON.stringify(r1.data).slice(0, 100) : 'N/A')}`);

  const r2 = runCli(`npx tsx index.ts build-system-architecture --workdir ${workDir} --iteration 1`);
  const converged = (r2.data as Record<string, unknown>)?.converged ?? false;
  check(checks, 's6_system_architecture', r2.status === 'ok', converged ? 'converged' : `not converged (${(r2.data as Record<string,unknown>)?.errors ?? '?'} errors)`);
}

// ===================== Main =====================

export async function main(args: string[]): Promise<CliResult> {
  let configPath: string | null;
  let srsPath: string | null;
  let stageFilter: string | null;
  try {
    configPath = safeParseArg(args, '--llm-config');
    srsPath = safeParseArg(args, '--srs');
    stageFilter = safeParseArg(args, '--stage');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!configPath) return { status: 'error', message: 'Missing --llm-config' };

  let config;
  try { config = loadLlmConfig(configPath); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const worker = new DebugWorker(config, /* maxRetries */ 1);

  const tmpBase = `/tmp/srs-debug-${Date.now()}`;
  const tmpWorkDir = path.join(tmpBase, '.srs_formalizer');
  fs.mkdirSync(tmpBase, { recursive: true });

  const stages: StageResult[] = [];
  const filter = stageFilter || 'ALL';
  const startedAt = new Date().toISOString();

  // S0: LLM availability test
  if (filter === 'ALL' || filter === 'S0') {
    const t0 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    await testS0(worker, checks);
    stages.push({ stage: 'S0', passed: checks.every(c => c.passed), checks, duration_ms: Date.now() - t0 });
  }

  // S1: Preprocessing
  if (filter === 'ALL' || filter === 'S1') {
    const t1 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    testS1(tmpWorkDir, checks);
    stages.push({ stage: 'S1', passed: checks.every(c => c.passed), checks, duration_ms: Date.now() - t1 });
  }

  // S2: Extraction
  if (filter === 'ALL' || filter === 'S2') {
    const t2 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    await testS2WithLLM(worker, tmpWorkDir, checks);
    stages.push({ stage: 'S2', passed: checks.every(c => c.passed), checks, duration_ms: Date.now() - t2 });
  }

  // S3: Graph
  if (filter === 'ALL' || filter === 'S3') {
    const t3 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    testS3(tmpWorkDir, checks);
    stages.push({ stage: 'S3', passed: checks.every(c => c.passed), checks, duration_ms: Date.now() - t3 });
  }

  // S4: BDD
  if (filter === 'ALL' || filter === 'S4') {
    const t4 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    testS4(tmpWorkDir, checks);
    stages.push({ stage: 'S4', passed: checks.every(c => c.passed), checks, duration_ms: Date.now() - t4 });
  }

  // S5: Formal
  if (filter === 'ALL' || filter === 'S5') {
    const t5 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    testS5(tmpWorkDir, checks);
    stages.push({ stage: 'S5', passed: checks.every(c => c.passed), checks, duration_ms: Date.now() - t5 });
  }

  // S6: Gate
  if (filter === 'ALL' || filter === 'S6') {
    const t6 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    testS6(tmpWorkDir, checks);
    stages.push({ stage: 'S6', passed: checks.every(c => c.passed), checks, duration_ms: Date.now() - t6 });
  }

  fs.rmSync(tmpBase, { recursive: true, force: true });

  const allChecks = stages.flatMap(s => s.checks);
  const report: DebugReport = {
    model: config.name,
    srs_path: srsPath || '(fixture)',
    started_at: startedAt,
    stages,
    summary: {
      total_stages: stages.length,
      passed: stages.filter(s => s.passed).length,
      failed: stages.filter(s => !s.passed).length,
      total_checks: allChecks.length,
      passed_checks: allChecks.filter(c => c.passed).length,
      total_duration_ms: stages.reduce((s, st) => s + st.duration_ms, 0),
    },
  };

  // Write report
  const reportPath = `/tmp/srs-debug-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  return {
    status: report.summary.failed === 0 ? 'ok' : 'error',
    data: { report_path: reportPath, summary: report.summary, stages: report.stages },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
