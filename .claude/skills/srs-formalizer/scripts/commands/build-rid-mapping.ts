/**
 * build-rid-mapping.ts — emit the RID ↔ IR mapping contract (proposal §P1-2).
 *
 * Scans frozen feature assets for `@RID-*` tags, reads srs-ir.json, and writes
 * `_ctx/rid_mapping.json` linking each frozen RID to the IR node(s) it derived
 * into. Deterministic; no LLM, no network.
 *
 * CLI: build-rid-mapping --workdir .srs_formalizer --frozen <dir> [--strict]
 *   --frozen : directory of frozen `.feature` files (the SSoT upstream).
 *   --strict : status error when unmapped RIDs exist (coverage holes).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR } from '../types/srs-ir.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';
import { collectByExtension } from '../lib/artifacts/validation-report.js';
import { buildRidMapping, extractFrozenRids, type FrozenRid } from '../lib/rid-mapping.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null; let frozenArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); frozenArg = safeParseArg(args, '--frozen'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  if (!frozenArg) return { status: 'error', message: 'Missing required argument: --frozen' };
  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  const strict = args.includes('--strict');

  if (!fs.existsSync(frozenArg)) return { status: 'error', message: `Frozen assets directory not found: ${frozenArg}` };
  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) return { status: 'error', message: `srs-ir.json not found at ${irPath}` };
  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf8')) as SRSIR; }
  catch (err) { return { status: 'error', message: `Failed to parse IR: ${(err as Error).message}` }; }

  const frozenRids: FrozenRid[] = [];
  const seen = new Set<string>();
  for (const file of collectByExtension(frozenArg, '.feature')) {
    for (const fr of extractFrozenRids(fs.readFileSync(file, 'utf8'))) {
      if (!seen.has(fr.rid)) { seen.add(fr.rid); frozenRids.push(fr); }
    }
  }

  const mapping = buildRidMapping(frozenRids, ir, frozenArg);
  const outPath = path.join(workDir, '_ctx', 'rid_mapping.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2), 'utf8');

  const summary = { rids: frozenRids.length, mapped: mapping.entries.length, unmappedRids: mapping.unmappedRids.length, unmappedNodeIds: mapping.unmappedNodeIds.length };
  if (strict && mapping.unmappedRids.length > 0) {
    return { status: 'error', message: `${mapping.unmappedRids.length} frozen RID(s) have no IR mapping`, data: { mapping: outPath, ...summary, unmappedRids: mapping.unmappedRids } };
  }
  return { status: 'ok', data: { mapping: outPath, ...summary } };
}

refuseDirectInvocation(import.meta.url);
