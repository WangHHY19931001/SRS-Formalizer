/**
 * build-system-architecture.ts — 系统架构图谱（跨层合成）(S6)
 *
 * CLI: npx tsx index.ts build-system-architecture --workdir .srs_formalizer [--iteration N]
 *
 * 读取全部四层图谱 → 合成顶层系统架构图谱 + 一致性校验
 * 前置条件: requirements, behavior, tla, lean graphs (缺失的层自动跳过)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { buildSystemArchitecture, exportSystemArchToCypher } from '../lib/system-architecture.js';
import { verifyCrossGraphConsistency } from '../lib/cross-graph-verifier.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let iterStr: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    iterStr = safeParseArg(args, '--iteration');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const iteration = iterStr ? parseInt(iterStr, 10) : 1;
  if (isNaN(iteration) || iteration < 1) {
    return { status: 'error', message: '--iteration must be a positive integer' };
  }

  // Build
  const graph = buildSystemArchitecture(workDir, iteration);

  // Write JSON
  const graphPath = path.join(workDir, '6_outputs', 'system-architecture.json');
  const outDir = path.join(workDir, '6_outputs', 'knowledge_graph');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'system-architecture.cypher'), exportSystemArchToCypher(graph), 'utf-8');

  // Cross-graph consistency verification (10 fundamental questions)
  const crossGraphReport = verifyCrossGraphConsistency(workDir, iteration);

  // Write cross-graph report
  const crossReportPath = path.join(workDir, '6_outputs', 'cross-graph-report.json');
  fs.writeFileSync(crossReportPath, JSON.stringify(crossGraphReport, null, 2), 'utf-8');

  // Write iteration log
  const logPath = path.join(workDir, '6_outputs', 'convergence-log.jsonl');
  const logEntry = JSON.stringify({
    iteration,
    timestamp: graph.metadata.generated_at,
    total_cross_edges: graph.metadata.total_cross_edges,
    checks: graph.consistency.map(c => ({ name: c.name, passed: c.passed, severity: c.severity })),
    cross_graph: {
      total_questions: crossGraphReport.summary.total_questions,
      answerable: crossGraphReport.summary.answerable,
      unanswerable: crossGraphReport.summary.unanswerable,
      needs_human: crossGraphReport.summary.needs_human,
    },
  });
  fs.appendFileSync(logPath, logEntry + '\n', 'utf-8');

  const errorCount = graph.consistency.filter(c => c.severity === 'error' && !c.passed).length;
  const warningCount = graph.consistency.filter(c => c.severity === 'warning' && !c.passed).length;
  const allAnswerable = crossGraphReport.overall_converged;

  return {
    status: errorCount === 0 ? 'ok' : 'error',
    data: {
      iteration,
      total_cross_edges: graph.metadata.total_cross_edges,
      errors: errorCount,
      warnings: warningCount,
      converged: errorCount === 0 && warningCount === 0 && allAnswerable,
      cross_graph_summary: crossGraphReport.summary,
      checks: graph.consistency,
    },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
