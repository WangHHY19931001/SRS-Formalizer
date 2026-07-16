import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR } from '../types/srs-ir.js';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import {
  EMITTER_GROUPS,
  emitterNames,
  emittersInGroup,
  findEmitter,
  type RegisteredEmitter,
} from '../lib/artifacts/emitter-registry.js';

interface EmitterResult {
  name: string;
  group: string;
  lifecycle: string;
  files: string[];
  fileCount: number;
  metadata: Record<string, unknown>;
}

function selectedEmitters(name: string | null, group: string | null): readonly RegisteredEmitter[] | null {
  if ((name === null && group === null) || (name !== null && group !== null)) return null;
  if (name !== null) {
    const entry = findEmitter(name);
    return entry ? [entry] : [];
  }
  if (group === 'all') return [...emittersInGroup('graphs'), ...emittersInGroup('bdd'), ...emittersInGroup('formal'), ...emittersInGroup('vmodel'), ...emittersInGroup('verify')];
  if (!(EMITTER_GROUPS as readonly string[]).includes(group!)) return [];
  return emittersInGroup(group as typeof EMITTER_GROUPS[number]);
}

export async function main(args: string[]): Promise<CliResult> {
  let name: string | null;
  let group: string | null;
  let workDirArg: string | null;
  try {
    name = safeParseArg(args, '--name');
    group = safeParseArg(args, '--group');
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if ((name === null && group === null) || (name !== null && group !== null)) {
    return { status: 'error', message: 'Specify exactly one of --name or --group' };
  }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  const selected = selectedEmitters(name, group);
  if (!selected || selected.length === 0) {
    const validGroups = [...EMITTER_GROUPS, 'all'].join(', ');
    return {
      status: 'error',
      message: name
        ? `Unknown emitter: ${name}. Valid: ${emitterNames().join(', ')}`
        : `Unknown emitter group: ${group}. Valid: ${validGroups}`,
    };
  }

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return { status: 'error', message: `srs-ir.json not found in workdir: ${irPath}` };

  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR; }
  catch (err) { return { status: 'error', message: `Failed to read srs-ir.json: ${(err as Error).message}` }; }
  if (ir.version !== '2.0.0') return { status: 'error', message: `Invalid IR version: ${ir.version}` };

  const results: EmitterResult[] = selected.map(entry => {
    const result = entry.emitter.emit(ir, workDir);
    return {
      name: entry.name,
      group: entry.group,
      lifecycle: entry.lifecycle,
      files: result.files,
      fileCount: result.fileCount,
      metadata: result.metadata,
    };
  });

  return {
    status: 'ok',
    data: {
      selection: name ? { name } : { group },
      emitters: results,
      totalFiles: results.reduce((total, result) => total + result.fileCount, 0),
    },
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
