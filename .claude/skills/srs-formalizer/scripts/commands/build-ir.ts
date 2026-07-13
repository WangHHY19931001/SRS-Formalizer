import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { buildIR } from '../lib/frontend/builder.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  let ir;
  try { ir = buildIR(workDir); }
  catch (err) { return { status: 'error', message: `IR build failed: ${(err as Error).message}` }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf-8');

  return { status: 'ok', data: { nodes: ir.meta.totalNodes, edges: ir.meta.totalEdges, ir_path: irPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
