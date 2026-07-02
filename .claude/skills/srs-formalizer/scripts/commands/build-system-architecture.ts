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
import { validateWorkDir } from '../lib/security.js';
import { buildSystemArchitecture, exportSystemArchToCypher } from '../lib/system-architecture.js';

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

export async function main(args: string[]): Promise<CliResult> {
  const workDirArg = parseArg(args, '--workdir');
  const iterStr = parseArg(args, '--iteration');

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

  // Write iteration log
  const logPath = path.join(workDir, '6_outputs', 'convergence-log.jsonl');
  const logEntry = JSON.stringify({
    iteration,
    timestamp: graph.metadata.generated_at,
    total_cross_edges: graph.metadata.total_cross_edges,
    checks: graph.consistency.map(c => ({ name: c.name, passed: c.passed, severity: c.severity })),
  });
  fs.appendFileSync(logPath, logEntry + '\n', 'utf-8');

  const errorCount = graph.consistency.filter(c => c.severity === 'error' && !c.passed).length;
  const warningCount = graph.consistency.filter(c => c.severity === 'warning' && !c.passed).length;

  return {
    status: errorCount === 0 ? 'ok' : 'error',
    data: {
      iteration,
      total_cross_edges: graph.metadata.total_cross_edges,
      errors: errorCount,
      warnings: warningCount,
      converged: errorCount === 0 && warningCount === 0,
      checks: graph.consistency,
    },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
