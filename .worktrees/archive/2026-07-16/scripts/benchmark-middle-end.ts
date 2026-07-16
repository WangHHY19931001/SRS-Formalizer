/**
 * benchmark-middle-end.ts — Performance benchmark for middle-end passes
 *
 * Generates synthetic IRs of varying sizes and measures the wall-clock time
 * of each middle-end pass when run via the parallelized runner.
 *
 * Usage: npx tsx benchmark-middle-end.ts [--sizes 10,50,100,200] [--runs 3]
 * Output: bench-results.json (in scripts/ directory)
 *
 * Related: Issue #13 (Performance & Scalability)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import type { SRSIR, IRNode, IREdge } from './types/srs-ir.js';
import { runMiddleEndPasses } from './lib/pipeline/middle-end-runner.js';

interface BenchResult {
  nodeCount: number;
  edgeCount: number;
  run: number;
  totalMs: number;
  passes: Array<{ id: string; name: string; durationMs: number; status: string }>;
  phaseTimings: { phase1Ms: number; phase2Ms: number; phase3Ms: number };
  memoryMb: { before: number; after: number; peak: number };
}

interface BenchSummary {
  suite: string;
  timestamp: string;
  gitCommit: string | undefined;
  nodeVersion: string;
  results: BenchResult[];
  averages: Array<{ nodeCount: number; avgTotalMs: number; avgPhase1Ms: number; avgPhase2Ms: number; avgPhase3Ms: number }>;
}

const STATEMENTS = [
  '系统响应时间 ≤ 200ms',
  '所有数据传输需加密，采用 AES-256',
  '系统可用性 ≥ 99.9%',
  '用户点击登录按钮',
  '系统支持 10000 并发用户',
  '密码长度不少于 8 位',
  '系统应在 30 秒内完成批处理',
  '用户可导出 PDF 报告',
  '日志保留 90 天',
  '接口兼容 HTTP/1.1 与 HTTP/2',
  '数据备份每日执行',
  '管理员可配置阈值',
  '前端兼容 Chrome 与 Firefox',
  '系统应支持横向扩展',
  '操作日志不可篡改',
];

function generateIR(nodeCount: number): SRSIR {
  const nodes: IRNode[] = [];
  const edges: IREdge[] = [];
  const edgeCount = Math.floor(nodeCount * 0.7);

  for (let i = 0; i < nodeCount; i++) {
    const stmt = STATEMENTS[i % STATEMENTS.length]!;
    nodes.push({
      id: `R1-${String(i + 1).padStart(4, '0')}`,
      type: 'requirement',
      module: i < nodeCount / 2 ? 'mod-a' : 'mod-b',
      labels: [':Requirement'],
      properties: { statement: stmt, category: 'explicit', confidence: 'high' },
      source: { filePath: '/tmp/srs.md', startLine: i + 1, endLine: i + 2, shardId: `shard-${Math.floor(i / 10) + 1}`, chapter: `§${(i % 5) + 1}` },
    });
  }

  for (let i = 0; i < edgeCount; i++) {
    const sourceIdx = i % nodeCount;
    const targetIdx = (i + 1) % nodeCount;
    if (sourceIdx === targetIdx) continue;
    edges.push({
      id: `E-${String(i + 1).padStart(4, '0')}`,
      source: `R1-${String(sourceIdx + 1).padStart(4, '0')}`,
      target: `R1-${String(targetIdx + 1).padStart(4, '0')}`,
      type: 'depends_on',
      properties: {},
    });
  }

  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/tmp/srs.md', sourceHash: 'bench', language: 'zh',
      totalChars: nodeCount * 50, totalShards: Math.ceil(nodeCount / 10),
      totalNodes: nodes.length, totalEdges: edges.length,
      buildTimestamp: new Date().toISOString(),
    },
    nodes, edges, crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

function getMemoryMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function runBenchmark(nodeCount: number, runIdx: number): Promise<BenchResult> {
  const tmpDir = path.join(os.tmpdir(), `srs-bench-${Date.now()}-${nodeCount}-${runIdx}`);
  const workDir = path.join(tmpDir, '.srs_formalizer');
  fs.mkdirSync(workDir, { recursive: true });

  const ir = generateIR(nodeCount);
  fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify(ir, null, 2), 'utf-8');

  const memBefore = getMemoryMb();
  const start = Date.now();
  const results = await runMiddleEndPasses({ workDir });
  const totalMs = Date.now() - start;
  const memAfter = getMemoryMb();

  let phase1Ms = 0, phase2Ms = 0, phase3Ms = 0;
  for (const r of results) {
    if (r.id === 'analyze-structure' || r.id === 'analyze-graph') phase1Ms += r.duration_ms;
    else if (r.id === 'tag-nfr') phase2Ms += r.duration_ms;
    else phase3Ms += r.duration_ms;
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  return {
    nodeCount,
    edgeCount: ir.edges.length,
    run: runIdx,
    totalMs,
    passes: results.map(r => ({ id: r.id, name: r.name, durationMs: r.duration_ms, status: r.status })),
    phaseTimings: { phase1Ms, phase2Ms, phase3Ms },
    memoryMb: { before: memBefore, after: memAfter, peak: memAfter },
  };
}

function parseArgs(): { sizes: number[]; runs: number } {
  const args = process.argv.slice(2);
  let sizes = [10, 50, 100, 200];
  let runs = 3;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sizes' && args[i + 1]) {
      sizes = args[i + 1]!.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      i++;
    } else if (args[i] === '--runs' && args[i + 1]) {
      runs = parseInt(args[i + 1]!, 10);
      if (isNaN(runs) || runs < 1) runs = 3;
      i++;
    }
  }

  return { sizes, runs };
}

async function main(): Promise<void> {
  const { sizes, runs } = parseArgs();
  const allResults: BenchResult[] = [];

  console.log(`Benchmarking middle-end passes (sizes: ${sizes.join(', ')}, runs per size: ${runs})\n`);

  for (const size of sizes) {
    for (let run = 1; run <= runs; run++) {
      process.stdout.write(`  ${size} nodes, run ${run}/${runs}... `);
      const result = await runBenchmark(size, run);
      allResults.push(result);
      console.log(`${result.totalMs}ms (phase1: ${result.phaseTimings.phase1Ms}ms, phase2: ${result.phaseTimings.phase2Ms}ms, phase3: ${result.phaseTimings.phase3Ms}ms)`);
    }
  }

  const averages = sizes.map(size => {
    const sizeResults = allResults.filter(r => r.nodeCount === size);
    const avg = (sel: (r: BenchResult) => number) =>
      sizeResults.reduce((sum, r) => sum + sel(r), 0) / sizeResults.length;
    return {
      nodeCount: size,
      avgTotalMs: Math.round(avg(r => r.totalMs) * 100) / 100,
      avgPhase1Ms: Math.round(avg(r => r.phaseTimings.phase1Ms) * 100) / 100,
      avgPhase2Ms: Math.round(avg(r => r.phaseTimings.phase2Ms) * 100) / 100,
      avgPhase3Ms: Math.round(avg(r => r.phaseTimings.phase3Ms) * 100) / 100,
    };
  });

  const summary: BenchSummary = {
    suite: 'srs-formalizer-middle-end-bench',
    timestamp: new Date().toISOString(),
    gitCommit: (() => { try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return undefined; } })(),
    nodeVersion: process.version,
    results: allResults,
    averages,
  };

  const outputPath = path.resolve('bench-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`\nSummary:`);
  console.log('  | Nodes | Avg Total (ms) | Phase 1 (ms) | Phase 2 (ms) | Phase 3 (ms) |');
  console.log('  |-------|----------------|--------------|--------------|--------------|');
  for (const a of averages) {
    console.log(`  | ${String(a.nodeCount).padStart(5)} | ${a.avgTotalMs.toFixed(2).padStart(14)} | ${a.avgPhase1Ms.toFixed(2).padStart(12)} | ${a.avgPhase2Ms.toFixed(2).padStart(12)} | ${a.avgPhase3Ms.toFixed(2).padStart(12)} |`);
  }
  console.log(`\nResults saved to ${outputPath}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
