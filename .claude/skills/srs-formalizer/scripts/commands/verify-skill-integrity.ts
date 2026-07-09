/**
 * verify-skill-integrity.ts - 逐文件校验 hash，检测篡改，可选自动恢复
 *
 * CLI: npx tsx index.ts verify-skill-integrity --skill-dir <path> [--repair]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';
import { verify, performRepair } from '../lib/skill-integrity.js';
import type { VerifyResult } from '../lib/skill-integrity.js';

export async function main(args: string[]): Promise<CliResult> {
  let skillDirArg: string | null;
  try { skillDirArg = safeParseArg(args, '--skill-dir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  if (!skillDirArg) return { status: 'error', message: 'Missing required argument: --skill-dir' };

  const skillDir = path.resolve(skillDirArg);
  if (!fs.existsSync(skillDir)) return { status: 'error', message: `Skill directory not found: ${skillDir}` };
  if (!fs.statSync(skillDir).isDirectory()) return { status: 'error', message: `Not a directory: ${skillDir}` };

  let result: VerifyResult;
  try { result = verify(skillDir); }
  catch (err) { return { status: 'error', message: (err instanceof Error ? err.message : String(err)) }; }

  if (args.includes('--repair')) {
    if (result.valid) return { status: 'ok', data: { ...result, repair_status: 'no_repair_needed', repaired: [], errors: [] } };

    const { repaired, errors } = performRepair(skillDir, result);
    let recheckResult: VerifyResult;
    try { recheckResult = verify(skillDir); }
    catch (err: unknown) {
      return { status: 'error', message: `Repair attempted but re-verification failed: ${(err instanceof Error ? err.message : String(err))}`, data: { repaired, errors } };
    }

    return { status: 'ok', data: { ...recheckResult, repair_status: recheckResult.valid ? 'repaired_ok' : 'repair_partial', repaired, errors } };
  }

  return { status: 'ok', data: result };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
