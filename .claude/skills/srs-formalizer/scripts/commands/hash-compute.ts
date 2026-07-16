import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';

export async function main(args: string[]): Promise<CliResult> {
  let fileArg: string | null;
  let compareArg: string | null;
  try {
    fileArg = safeParseArg(args, '--file');
    compareArg = safeParseArg(args, '--compare');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!fileArg) return { status: 'error', message: 'Missing required argument: --file' };

  try {
    const content = fs.readFileSync(fileArg);
    const hash = createHash('sha256').update(content).digest('hex');

    if (compareArg !== null) {
      const match = hash === compareArg;
      if (match) {
        return { status: 'ok', data: { hash, match: true } };
      }
      return { status: 'error', message: `Hash mismatch: expected ${compareArg}, got ${hash}`, data: { hash, match: false } };
    }

    return { status: 'ok', data: { hash } };
  } catch (err) {
    return { status: 'error', message: `Hash compute failed: ${(err as Error).message}` };
  }
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
