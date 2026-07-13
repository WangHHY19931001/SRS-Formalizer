import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { hashFiles, writeValidationReport } from '../lib/artifacts/validation-report.js';
import { promoteFiles } from '../lib/artifacts/promotion.js';
import { validateTla } from '../lib/tla-validator.js';

const PLACEHOLDER = /LLM_FILL|TODO|FIXME|TBD|\bGAP\b|待定|未定义|待实现/i;

function staticErrors(source: string, cfg: string): string[] {
  const errors: string[] = [];
  if (PLACEHOLDER.test(source)) errors.push('forbidden placeholder found');
  if ((source.match(/----\s*MODULE\s+\w+\s*----/g) ?? []).length !== 1) errors.push('exactly one module header is required');
  if (!/VARIABLES\s+\w+/.test(source)) errors.push('non-empty VARIABLES declaration is required');
  for (const operator of ['Init', 'Next', 'TypeOK']) if (!new RegExp(`^${operator}\\s*==\\s*\\S`, 'm').test(source)) errors.push(`non-empty ${operator} definition is required`);
  if (!/^INVARIANT\s+TypeOK/m.test(cfg)) errors.push('cfg must declare TypeOK invariant');
  return errors;
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null; let name: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); name = safeParseArg(args, '--name'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg || !name) return { status: 'error', message: `Missing required argument: ${!workDirArg ? '--workdir' : '--name'}` };
  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  const strict = args.includes('--strict'); const promote = args.includes('--promote');
  if (promote && !strict) return { status: 'error', message: '--promote requires --strict' };
  const sourceDir = artifactPath(workDir, promote ? ARTIFACT_PATHS.tlaDraft : ARTIFACT_PATHS.tlaVerified);
  const tlaFile = path.join(sourceDir, `${name}.tla`); const cfgFile = path.join(sourceDir, `${name}.cfg`);
  if (!fs.existsSync(tlaFile) || !fs.existsSync(cfgFile)) return { status: 'error', message: 'candidate .tla and matching .cfg are required' };
  const startedAt = new Date().toISOString();
  const errors = strict ? staticErrors(fs.readFileSync(tlaFile, 'utf8'), fs.readFileSync(cfgFile, 'utf8')) : [];
  if (errors.length) return { status: 'error', message: 'TLA+ static validation failed', data: { errors } };
  if (!strict) return { status: 'ok', data: { files: [tlaFile, cfgFile] } };
  let result;
  try { result = validateTla(tlaFile, cfgFile); }
  catch (err) { return { status: 'error', message: 'TLA+ toolchain unavailable', data: { error: (err as Error).message } }; }
  if (!result.passed) return { status: 'error', message: 'TLA+ SANY or TLC validation failed', data: { sany: result.sany, tlc: result.tlc } };
  const sourceHash = hashFiles([tlaFile, cfgFile]);
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.tlaValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, { artifactKind: 'tlaplus', lifecycle: 'verified', sourcePaths: [tlaFile, cfgFile], sourceHash, irHash: sourceHash, tools: [{ name: 'java', version: result.javaVersion }, { name: 'tla2tools', version: result.jarVersion }], startedAt, completedAt: new Date().toISOString(), passed: true, checks: [{ name: 'static specification checks', passed: true }, { name: 'SANY', passed: true, detail: result.sany.output.slice(0, 500) }, { name: 'TLC', passed: true, detail: result.tlc.output.slice(0, 500) }] });
  const files = promote ? promoteFiles(sourceDir, artifactPath(workDir, ARTIFACT_PATHS.tlaVerified), [`${name}.tla`, `${name}.cfg`]) : [tlaFile, cfgFile];
  return { status: 'ok', data: { files, report: reportPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
