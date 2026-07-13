import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { tagNFR } from '../lib/middle-end/nfr-tagger.js';
import type { SRSIR } from '../types/srs-ir.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return { status: 'error', message: `srs-ir.json not found at ${irPath}` };

  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR; }
  catch (err) { return { status: 'error', message: `Failed to parse IR: ${(err as Error).message}` }; }

  const result = tagNFR(ir);

  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf-8');

  return { status: 'ok', data: { tagged: result.tagged, thresholdsFound: result.thresholdsFound } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
