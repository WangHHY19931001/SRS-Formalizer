/**
 * analyze-dataflow.ts — 数据流审视提示分析命令（spec 2026-07-21）
 *
 * CLI: npx tsx index.ts analyze-dataflow --workdir .srs_formalizer
 *
 * 只读 srs-ir.json，产出 3_graph/analysis/dataflow.json（四类可疑清单）。
 * 恒为 warning，不参与 fail-closed（无 --strict 语义）：
 *   - 有 findings → status 'warn'（供收敛循环复核，不阻断流水线）
 *   - 无 findings → status 'ok'
 * 对无 data_entity 的旧 IR（schema 2.0.0）降级为空 findings，不报错。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR } from '../types/srs-ir.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';
import { analyzeDataFlow } from '../lib/middle-end/dataflow-analyzer.js';
import { assessInjectionGate, defaultGate, INJECTION_GATE_FILENAME, type DataFlowInjectionGate } from '../lib/dataflow-gate.js';

/** 读取注入门控；缺失/损坏 → 默认 shadow 模式（注入关闭）。 */
function readInjectionGate(workDir: string): DataFlowInjectionGate {
  const gatePath = path.join(workDir, '_ctx', INJECTION_GATE_FILENAME);
  if (!fs.existsSync(gatePath)) return defaultGate();
  try {
    const raw = JSON.parse(fs.readFileSync(gatePath, 'utf-8')) as Partial<DataFlowInjectionGate>;
    return { ...defaultGate(), ...raw, injectionEnabled: raw.injectionEnabled === true };
  } catch {
    return defaultGate();
  }
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  // --assess 模式：人工评估假阳性率后写入注入门控（层次 2 上线前提）。
  if (args.includes('--assess')) {
    return assessMode(args, workDir);
  }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return { status: 'error', message: `srs-ir.json not found at ${irPath}` };

  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR; }
  catch (err) { return { status: 'error', message: `Failed to parse IR: ${(err as Error).message}` }; }

  const analysis = analyzeDataFlow(ir);

  const outDir = path.join(workDir, '3_graph', 'analysis');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dataflow.json');
  fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2), 'utf-8');

  const counts = { dead_data: 0, boundary: 0, gap: 0, cycle: 0 };
  for (const f of analysis.findings) counts[f.findingType]++;

  const hasFindings = analysis.findings.length > 0;
  const gate = readInjectionGate(workDir);
  const mode = gate.injectionEnabled ? 'injection-enabled' : 'shadow';
  return {
    status: hasFindings ? 'warn' : 'ok',
    message: `数据流分析完成：${analysis.entities.length} 个数据实体，${analysis.findings.length} 条审视提示（dead_data=${counts.dead_data}, gap=${counts.gap}, boundary=${counts.boundary}, cycle=${counts.cycle}）｜注入门控：${mode}`,
    data: { report_path: outPath, ...analysis, counts, injectionGate: gate, injectionMode: mode },
  };
}

/**
 * --assess：人工评估假阳性率后写入 `_ctx/dataflow_injection_gate.json`。
 * 用法：analyze-dataflow --assess --fp-rate <0~1> --sample-size <n> --assessed-by <name> [--threshold <0~1>] [--reason <text>] --workdir .srs_formalizer
 * 达标 → injectionEnabled=true（层次 2 注入放开）；否则保持 shadow 模式。
 */
function assessMode(args: string[], workDir: string): CliResult {
  let fpStr: string | null, sampleStr: string | null, assessedBy: string | null, thresholdStr: string | null, reason: string | null;
  try {
    fpStr = safeParseArg(args, '--fp-rate');
    sampleStr = safeParseArg(args, '--sample-size');
    assessedBy = safeParseArg(args, '--assessed-by');
    thresholdStr = safeParseArg(args, '--threshold');
    reason = safeParseArg(args, '--reason');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (fpStr === null || sampleStr === null || assessedBy === null) {
    return { status: 'error', message: 'assess mode requires --fp-rate, --sample-size and --assessed-by' };
  }
  const falsePositiveRate = Number(fpStr);
  const sampleSize = Number(sampleStr);
  const threshold = thresholdStr !== null ? Number(thresholdStr) : undefined;
  if (Number.isNaN(falsePositiveRate) || Number.isNaN(sampleSize)) {
    return { status: 'error', message: '--fp-rate and --sample-size must be numbers' };
  }

  const { gate, errors } = assessInjectionGate({
    falsePositiveRate, sampleSize, assessedBy,
    ...(threshold !== undefined ? { threshold } : {}),
    ...(reason !== null ? { reason } : {}),
  });

  const ctxDir = path.join(workDir, '_ctx');
  fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(path.join(ctxDir, INJECTION_GATE_FILENAME), JSON.stringify(gate, null, 2), 'utf-8');

  return {
    status: 'ok',
    message: gate.injectionEnabled
      ? `注入门控已开启：假阳性率 ${falsePositiveRate} ≤ 阈值 ${gate.threshold}（样本 ${sampleSize}），层次 2 注入放开`
      : `注入门控保持 shadow 模式：${errors.join('; ')}`,
    data: { injectionGate: gate, errors },
  };
}

refuseDirectInvocation(import.meta.url);
