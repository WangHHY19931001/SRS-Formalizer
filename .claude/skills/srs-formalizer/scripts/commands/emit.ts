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
import { GherkinEmitter } from '../lib/emitters/gherkin-emitter.js';
import { TLAEmitter } from '../lib/emitters/tla-emitter.js';
import { LeanEmitter } from '../lib/emitters/lean-emitter.js';
import { FixtureEmitter } from '../lib/emitters/fixture-emitter.js';
import { CounterexampleEmitter } from '../lib/emitters/counterexample-emitter.js';
import { TraceabilityMatrixEmitter } from '../lib/emitters/traceability-emitter.js';

const GRAPH_EMITTERS: Record<string, Emitter> = {
  cypher: new CypherEmitter(),
  behaviorGraph: new BehaviorGraphEmitter(),
  tlaGraph: new TlaGraphEmitter(),
  leanGraph: new LeanGraphEmitter(),
};

const VMODEL_EMITTERS: Record<string, Emitter> = {
  fixture: new FixtureEmitter(),
  counterexample: new CounterexampleEmitter(),
  traceabilityMatrix: new TraceabilityMatrixEmitter(),
};

const ALL_EMITTERS: Record<string, Emitter> = {
  ...GRAPH_EMITTERS,
  gherkin: new GherkinEmitter(),
  tlaSpec: new TLAEmitter(),
  leanProof: new LeanEmitter(),
  ...VMODEL_EMITTERS,
};

function buildAll(ir: SRSIR, workdir: string): EmitResult[] {
  const results: EmitResult[] = [];
  for (const emitter of Object.values(ALL_EMITTERS)) {
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

  if (name === 'all') {
    const results = buildAll(ir, workDir);
    const totalFiles = results.reduce((sum, r) => sum + r.fileCount, 0);
    return {
      status: 'ok',
      data: {
        emitters: Object.keys(ALL_EMITTERS),
        totalFiles,
        results: results.map(r => ({
          dir: r.files[0] ? path.dirname(r.files[0]) : '',
          fileCount: r.fileCount,
          files: r.files,
          metadata: r.metadata,
        })),
      },
    };
  }

  if (name === 'graphs') {
    const graphResults: { name: string; files: string[]; fileCount: number; metadata: Record<string, unknown> }[] = [];
    for (const gName of Object.keys(GRAPH_EMITTERS)) {
      const emitter = ALL_EMITTERS[gName];
      if (emitter) {
        const r = emitter.emit(ir, workDir);
        graphResults.push({ name: gName, files: r.files, fileCount: r.fileCount, metadata: r.metadata });
      }
    }
    const totalFiles = graphResults.reduce((sum, r) => sum + r.fileCount, 0);
    return {
      status: 'ok',
      data: {
        emitters: Object.keys(GRAPH_EMITTERS),
        totalFiles,
        results: graphResults,
      },
    };
  }

  if (name === 'formal') {
    const formalEmitters = ['tlaSpec', 'leanProof'];
    const formalResults: { name: string; files: string[]; fileCount: number; metadata: Record<string, unknown> }[] = [];
    for (const fName of formalEmitters) {
      const emitter = ALL_EMITTERS[fName];
      if (emitter) {
        const r = emitter.emit(ir, workDir);
        formalResults.push({ name: fName, files: r.files, fileCount: r.fileCount, metadata: r.metadata });
      }
    }
    const totalFiles = formalResults.reduce((sum, r) => sum + r.fileCount, 0);
    return {
      status: 'ok',
      data: {
        emitters: formalEmitters,
        totalFiles,
        results: formalResults,
      },
    };
  }

  if (name === 'vmodel') {
    const vModelNames = Object.keys(VMODEL_EMITTERS);
    const vModelResults: { name: string; files: string[]; fileCount: number; metadata: Record<string, unknown> }[] = [];
    for (const vName of vModelNames) {
      const emitter = VMODEL_EMITTERS[vName];
      if (emitter) {
        const r = emitter.emit(ir, workDir);
        vModelResults.push({ name: vName, files: r.files, fileCount: r.fileCount, metadata: r.metadata });
      }
    }
    const totalFiles = vModelResults.reduce((sum, r) => sum + r.fileCount, 0);
    return {
      status: 'ok',
      data: {
        emitters: vModelNames,
        totalFiles,
        results: vModelResults,
      },
    };
  }

  const emitter = ALL_EMITTERS[name];
  if (!emitter) {
    const valid = Object.keys(ALL_EMITTERS).join(', ');
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
