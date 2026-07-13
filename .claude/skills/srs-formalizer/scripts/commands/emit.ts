import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../types/srs-ir.js';
import type { CliResult } from '../types/index.js';
import type { Emitter, EmitResult } from '../lib/emitters/types.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { CypherEmitter } from '../lib/emitters/cypher-emitter.js';
import { BehaviorGraphEmitter } from '../lib/emitters/behavior-graph-emitter.js';
import { TlaGraphEmitter } from '../lib/emitters/tla-graph-emitter.js';
import { LeanGraphEmitter } from '../lib/emitters/lean-graph-emitter.js';

const GRAPH_EMITTERS: Record<string, Emitter> = {
  cypher: new CypherEmitter(),
  behaviorGraph: new BehaviorGraphEmitter(),
  tlaGraph: new TlaGraphEmitter(),
  leanGraph: new LeanGraphEmitter(),
};

function buildAll(ir: SRSIR, workdir: string): EmitResult[] {
  const results: EmitResult[] = [];
  for (const emitter of Object.values(GRAPH_EMITTERS)) {
    results.push(emitter.emit(ir, workdir));
  }
  return results;
}

export async function main(args: string[]): Promise<CliResult> {
  let name: string | null;
  let workDirArg: string | null;
  try {
    name = safeParseArg(args, '--name');
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!name) return { status: 'error', message: 'Missing required argument: --name' };
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) {
    return { status: 'error', message: `srs-ir.json not found in workdir: ${irPath}` };
  }

  let ir: SRSIR;
  try {
    ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR;
  } catch (err) {
    return { status: 'error', message: `Failed to read srs-ir.json: ${(err as Error).message}` };
  }

  if (ir.version !== '2.0.0') {
    return { status: 'error', message: `Invalid IR version: ${ir.version}` };
  }

  if (name === 'all' || name === 'graphs') {
    const results = buildAll(ir, workDir);
    const totalFiles = results.reduce((sum, r) => sum + r.fileCount, 0);
    return {
      status: 'ok',
      data: {
        emitters: results.map(r => ({
          name: (GRAPH_EMITTERS['cypher']?.name),
          fileCount: r.fileCount,
          files: r.files,
        })),
        totalFiles,
      },
    };
  }

  const emitter = GRAPH_EMITTERS[name];
  if (!emitter) {
    const valid = Object.keys(GRAPH_EMITTERS).join(', ');
    return { status: 'error', message: `Unknown emitter: ${name}. Valid: ${valid}, all, graphs` };
  }

  const result = emitter.emit(ir, workDir);

  return {
    status: 'ok',
    data: {
      emitter: emitter.name,
      description: emitter.description,
      files: result.files,
      fileCount: result.fileCount,
      metadata: result.metadata,
    },
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
