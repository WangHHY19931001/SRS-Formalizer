/**
 * build-lean-graph.ts — 从 Lean 4 证明构建算法序列图谱 (S5)
 *
 * CLI: npx tsx index.ts build-lean-graph --workdir .srs_formalizer
 *
 * 读取 5_formal/proofs/*.lean → 构建证明依赖图谱
 * 条件触发：Lean 4 未启用时无 .lean 文件则跳过
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { buildLeanGraphFromDir, exportLeanToCypher } from '../lib/lean-graph.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
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

  const proofsDir = path.join(workDir, '5_formal', 'proofs');
  if (!fs.existsSync(proofsDir)) {
    return { status: 'ok', message: 'Lean 4 proofs not triggered — skipped', data: { skipped: true } };
  }

  const leanFiles = fs.readdirSync(proofsDir).filter(f => f.endsWith('.lean'));
  if (leanFiles.length === 0) {
    return { status: 'ok', message: 'No .lean files found — skipped', data: { skipped: true } };
  }

  // Check for unresolved sorry (should have been caught by lake build already)
  let hasSorry = false;
  for (const f of leanFiles) {
    if (fs.readFileSync(path.join(proofsDir, f), 'utf-8').includes('sorry')) {
      hasSorry = true;
      break;
    }
  }
  if (hasSorry) {
    return { status: 'error', message: 'Unresolved "sorry" found — run debug-lean and fix before building graph' };
  }

  // Build graph
  const graph = buildLeanGraphFromDir(proofsDir, workDir);

  // Write JSON
  const graphPath = path.join(workDir, '5_formal', 'lean-proof-graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');

  // Write Cypher
  const cypherOutDir = path.join(workDir, '6_outputs', 'knowledge_graph');
  if (!fs.existsSync(cypherOutDir)) fs.mkdirSync(cypherOutDir, { recursive: true });
  fs.writeFileSync(path.join(cypherOutDir, 'lean-proof.cypher'), exportLeanToCypher(graph), 'utf-8');

  const warnings: string[] = [];
  if (graph.metadata.axiom_count > 0) warnings.push(`${graph.metadata.axiom_count} axioms detected`);
  if (graph.metadata.sorry_count > 0) warnings.push(`${graph.metadata.sorry_count} files contain sorry`);

  return {
    status: 'ok',
    data: {
      files: graph.metadata.file_count,
      theorems: graph.metadata.theorem_count,
      lemmas: graph.metadata.lemma_count,
      imports: graph.metadata.import_count,
      max_depth: graph.metadata.max_proof_depth,
      warnings,
    },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
