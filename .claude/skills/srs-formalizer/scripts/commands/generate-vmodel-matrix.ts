/**
 * generate-vmodel-matrix.ts -- Build V-Model traceability matrix
 *
 * CLI: npx tsx index.ts generate-vmodel-matrix --workdir <dir> [--format markdown|cypher] [--output <file>]
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { buildTraceabilityMatrix } from '../lib/fixture-gen/traceability.js';
import type { TraceabilityEntry } from '../lib/fixture-gen/types.js';

function formatMarkdown(entries: TraceabilityEntry[]): string {
  let md = '# V-Model Traceability Matrix\n\n';
  md += '| Requirement ID | Title | BDD | TLA+ | Lean 4 | Fixtures | Status |\n';
  md += '|:---|:---|:--:|:--:|:--:|:--:|:--:|\n';

  for (const e of entries) {
    const bdd = e.bddScenarios.length || '—';
    const tla = e.tlaInvariants.length || '—';
    const lean = e.leanTheorems.length || '—';
    const fix = e.fixtureFiles.length || '—';
    md += `| ${e.requirementId} | ${e.requirementTitle} | ${bdd} | ${tla} | ${lean} | ${fix} | ${e.coverageStatus} |\n`;
  }

  const total = entries.length;
  const full = entries.filter(e => e.coverageStatus === 'full').length;
  const partial = entries.filter(e => e.coverageStatus === 'partial').length;
  const none = entries.filter(e => e.coverageStatus === 'none').length;
  const pct = total > 0 ? Math.round((full / total) * 1000) / 10 : 0;
  md += `\n**Summary**: ${total} requirements, ${full} full, ${partial} partial, ${none} none (coverage: ${pct}%)\n`;
  return md;
}

function formatCypher(entries: TraceabilityEntry[]): string {
  let cypher = '// V-Model Traceability Matrix — srs-formalizer\n';
  for (const e of entries) {
    cypher += `MERGE (r:Requirement {id: '${e.requirementId}', title: '${e.requirementTitle.replace(/'/g, "\\'")}'});\n`;
    for (const s of e.bddScenarios) {
      cypher += `MERGE (s:BDDScenario {name: '${s.replace(/'/g, "\\'")}'});\n`;
      cypher += `MERGE (r)-[:TRACED_TO {source: 'bdd'}]->(s);\n`;
    }
    for (const inv of e.tlaInvariants) {
      cypher += `MERGE (t:TLAInvariant {name: '${inv.replace(/'/g, "\\'")}'});\n`;
      cypher += `MERGE (r)-[:TRACED_TO {source: 'tla'}]->(t);\n`;
    }
    for (const th of e.leanTheorems) {
      cypher += `MERGE (l:LeanTheorem {name: '${th.replace(/'/g, "\\'")}'});\n`;
      cypher += `MERGE (r)-[:TRACED_TO {source: 'lean'}]->(l);\n`;
    }
  }
  return cypher;
}

export async function main(args: string[]): Promise<CliResult> {
  let formatArg: string | null;
  let outputArg: string | null;
  let workDirArg: string | null;

  try {
    formatArg = safeParseArg(args, '--format');
    outputArg = safeParseArg(args, '--output');
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const format = formatArg === 'cypher' ? 'cypher' : 'markdown';

  const workDirCandidate = workDirArg ?? process.cwd();
  let workDir: string;
  try {
    workDir = validateWorkDir(workDirCandidate);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  let entries: TraceabilityEntry[];
  try {
    entries = buildTraceabilityMatrix(workDir);
  } catch (err) {
    return { status: 'error', message: `Failed to build matrix: ${(err as Error).message}` };
  }

  const output = format === 'cypher' ? formatCypher(entries) : formatMarkdown(entries);

  if (outputArg) {
    try {
      fs.writeFileSync(outputArg, output, 'utf-8');
    } catch (err) {
      return { status: 'error', message: `Failed to write output: ${(err as Error).message}` };
    }
  }

  return {
    status: 'ok',
    data: {
      total_requirements: entries.length,
      full: entries.filter(e => e.coverageStatus === 'full').length,
      partial: entries.filter(e => e.coverageStatus === 'partial').length,
      none: entries.filter(e => e.coverageStatus === 'none').length,
      format,
      ...(outputArg ? { output_file: outputArg } : { matrix_output: output }),
    },
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
