/**
 * health-check.ts — Environment verification and capability self-report
 *
 * CLI: npx tsx index.ts health-check [--workdir <path>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import type { HealthCheck, HealthReport, PackageJson, WorkDirStatus } from '../lib/health/types.js';
import { checkJava, checkLean, checkNodeVersion, checkProjectFiles } from '../lib/health/checks.js';
import { checkWorkDir } from '../lib/health/workdir-check.js';
import { generateRecommendations } from '../lib/health/recommendations.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const checks: HealthCheck[] = [];

  checks.push(checkNodeVersion());
  checks.push(checkJava());
  checks.push(checkLean());
  checks.push(...checkProjectFiles(scriptDir));

  const pkgPath = path.join(scriptDir, 'package.json');
  let pkgVersion = '0.1.0';
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
      pkgVersion = pkg.version ?? '0.1.0';
      const depNames = pkg.devDependencies ? Object.keys(pkg.devDependencies) : [];
      checks.push({ name: 'dev_deps', status: 'ok', message: 'package.json valid', details: { devDependencies: depNames } });
    } catch {
      checks.push({ name: 'dev_deps', status: 'error', message: 'Failed to parse package.json' });
    }
  }

  const nodeModules = path.join(scriptDir, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    checks.push({ name: 'node_modules', status: 'ok', message: 'node_modules exists — devDependencies installed' });
  } else {
    checks.push({ name: 'node_modules', status: 'warn', message: 'node_modules not found — run "npm install"' });
  }

  let workdirStatus: WorkDirStatus | undefined;
  if (workDirArg) {
    try {
      const workDir = validateWorkDir(workDirArg);
      const result = checkWorkDir(workDir);
      checks.push(result.status);
      workdirStatus = result.workdirStatus;
    } catch (err) {
      checks.push({ name: 'workdir', status: 'error', message: (err as Error).message });
    }
  }

  const javaCheck = checks.find(c => c.name === 'java');
  const leanCheck = checks.find(c => c.name === 'lean4');
  const nodeModulesCheck = checks.find(c => c.name === 'node_modules');

  const capabilities = {
    tla_plus: javaCheck?.status === 'ok',
    lean4: leanCheck?.status === 'ok',
    bdd_validation: nodeModulesCheck?.status === 'ok',
    full_pipeline: javaCheck?.status === 'ok' && nodeModulesCheck?.status === 'ok',
  };

  const summary = {
    total: checks.length,
    ok: checks.filter(c => c.status === 'ok').length,
    warn: checks.filter(c => c.status === 'warn').length,
    error: checks.filter(c => c.status === 'error').length,
    skip: checks.filter(c => c.status === 'skip').length,
  };

  const recommendations = generateRecommendations(checks, capabilities);

  const report: HealthReport = {
    version: pkgVersion,
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: `${process.platform} ${process.arch}`,
    cwd: process.cwd(),
    checks,
    capabilities,
    workdir_status: workdirStatus,
    summary,
    recommendations,
  };

  const overallStatus = summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';
  const overallMessage = summary.error > 0
    ? `${summary.error} error(s), ${summary.warn} warning(s) found`
    : summary.warn > 0
      ? `${summary.warn} warning(s) found (non-blocking)`
      : `All ${summary.ok} checks passed`;

  return {
    status: overallStatus === 'error' ? 'error' : 'ok',
    message: `Health check: ${overallMessage}`,
    data: report,
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
