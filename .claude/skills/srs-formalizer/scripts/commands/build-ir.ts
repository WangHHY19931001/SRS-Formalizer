/**
 * build-ir.ts — [DEPRECATED] 将在 Task 4 被 assemble-ir 替代。
 *
 * CLI: npx tsx index.ts build-ir --workdir .srs_formalizer
 *
 * 临时返回 deprecation error，不构建 IR（原 lib/frontend/builder.ts 已归档）。
 * assemble-ir 命令将取代此命令。
 */

import type { CliResult } from '../types/index.js';
import { refuseDirectInvocation } from '../lib/cli.js';

export async function main(_args: string[]): Promise<CliResult> {
  return { status: 'error', message: 'build-ir is deprecated, use assemble-ir' };
}

refuseDirectInvocation(import.meta.url);
