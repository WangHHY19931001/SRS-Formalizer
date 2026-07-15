/**
 * health-check.ts — Environment verification and capability self-report
 *
 * CLI: npx tsx index.ts health-check [--workdir <path>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'error' | 'skip';
  message: string;
  details?: unknown;
}

interface WorkDirStatus {
  initialized: boolean;
  current_stage?: string;
  artifacts?: Record<string, string[]>;
}

interface HealthReport {
  version: string;
  timestamp: string;
  node_version: string;
  platform: string;
  cwd: string;
  checks: HealthCheck[];
  capabilities: {
    tla_plus: boolean;
    lean4: boolean;
    bdd_validation: boolean;
    full_pipeline: boolean;
  };
  workdir_status?: WorkDirStatus | undefined;
  summary: {
    total: number;
    ok: number;
    warn: number;
    error: number;
    skip: number;
  };
  recommendations: string[];
}

interface PackageJson {
  version?: string;
  devDependencies?: Record<string, string>;
}

function checkNodeVersion(): HealthCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0] ?? '0', 10);
  if (major >= 20) {
    return { name: 'node_version', status: 'ok', message: `Node.js ${version} (>=20 required)`, details: { version, major } };
  }
  return { name: 'node_version', status: 'error', message: `Node.js ${version} is too old (>=20 required)`, details: { version, major } };
}

function checkCommand(name: string, args: string[] = ['--version']): { available: boolean; output?: string | undefined } {
  try {
    const rawOutput = execSync(`${name} ${args.join(' ')}`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const firstLine = rawOutput.trim().split('\n')[0];
    return { available: true, output: firstLine };
  } catch {
    return { available: false, output: undefined };
  }
}

function checkJava(): HealthCheck {
  const result = checkCommand('java', ['-version']);
  if (result.available) {
    return {
      name: 'java',
      status: 'ok',
      message: 'Java available (TLA+ SANY/TLC enabled)',
      details: { version: result.output },
    };
  }
  return {
    name: 'java',
    status: 'warn',
    message: 'Java not found — TLA+ validation (SANY/TLC) will not be available',
  };
}

function checkLean(): HealthCheck {
  const result = checkCommand('lake', ['--version']);
  if (result.available) {
    return {
      name: 'lean4',
      status: 'ok',
      message: 'Lean 4 toolchain available',
      details: { version: result.output },
    };
  }
  return {
    name: 'lean4',
    status: 'warn',
    message: 'Lean 4 (lake) not found — Lean 4 validation will be skipped',
  };
}

function checkProjectFiles(scriptDir: string): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const requiredFiles = ['package.json', 'tsconfig.json', 'index.ts', 'lib/cli.ts'];

  for (const file of requiredFiles) {
    const filePath = path.join(scriptDir, file);
    if (fs.existsSync(filePath)) {
      checks.push({ name: `project_file:${file}`, status: 'ok', message: `${file} exists` });
    } else {
      checks.push({ name: `project_file:${file}`, status: 'error', message: `Missing required file: ${file}` });
    }
  }

  const tlaJar = path.join(scriptDir, '../../tools/tla2tools-1.7.4.jar');
  if (fs.existsSync(tlaJar)) {
    checks.push({ name: 'tla_tools', status: 'ok', message: 'TLA+ tools jar found' });
  } else {
    checks.push({ name: 'tla_tools', status: 'warn', message: 'TLA+ tools jar not found at expected location' });
  }

  return checks;
}

function checkWorkDir(workDir: string): { status: HealthCheck; workdirStatus?: WorkDirStatus } {
  if (!fs.existsSync(workDir)) {
    return {
      status: {
        name: 'workdir',
        status: 'warn',
        message: `Working directory does not exist: ${workDir}. Run "init --output ${workDir}" first.`,
      },
    };
  }

  const basename = path.basename(workDir);
  if (basename !== '.srs_formalizer') {
    return {
      status: {
        name: 'workdir',
        status: 'error',
        message: `Working directory must be named ".srs_formalizer", got "${basename}"`,
      },
    };
  }

  const stateFile = path.join(workDir, 'STATE.md');
  const irFile = path.join(workDir, 'srs-ir.json');
  let currentStage = 'unknown';
  const artifacts: Record<string, string[]> = {};

  if (fs.existsSync(stateFile)) {
    const stateContent = fs.readFileSync(stateFile, 'utf-8');
    const stageMatch = stateContent.match(/\| 当前阶段 \| ([^|]+) \|/);
    if (stageMatch) {
      currentStage = (stageMatch[1] ?? 'unknown').trim();
    }
  }

  const outputDirs = ['graphs', 'bdd', 'tlaplus', 'lean4', 'fixtures', 'reports'];
  for (const dir of outputDirs) {
    const draftPath = path.join(workDir, 'outputs', dir, 'draft');
    const verifiedPath = path.join(workDir, 'outputs', dir, 'verified');
    const files: string[] = [];

    if (fs.existsSync(draftPath)) {
      const draftFiles = fs.readdirSync(draftPath).filter(f => !f.startsWith('.'));
      for (const f of draftFiles) files.push(`draft/${f}`);
    }
    if (fs.existsSync(verifiedPath)) {
      const verifiedFiles = fs.readdirSync(verifiedPath).filter(f => !f.startsWith('.'));
      for (const f of verifiedFiles) files.push(`verified/${f}`);
    }

    if (files.length > 0) {
      artifacts[dir] = files;
    }
  }

  const irExists = fs.existsSync(irFile);
  const totalArtifacts = Object.values(artifacts).flat().length;

  return {
    status: {
      name: 'workdir',
      status: 'ok',
      message: `Working directory valid. Stage: ${currentStage}${irExists ? ' (IR built)' : ''}`,
      details: { path: workDir, stage: currentStage, ir_built: irExists, artifact_count: totalArtifacts },
    },
    workdirStatus: {
      initialized: true,
      current_stage: currentStage,
      artifacts,
    },
  };
}

function generateRecommendations(checks: HealthCheck[], capabilities: HealthReport['capabilities']): string[] {
  const recs: string[] = [];
  const hasError = checks.some(c => c.status === 'error');

  if (hasError) recs.push('Fix error-level checks before proceeding.');
  if (!capabilities.tla_plus) recs.push('Install Java JRE/JDK (>=11) to enable TLA+ model checking.');
  if (!capabilities.lean4) recs.push('Install Lean 4 (https://lean-lang.org/) for theorem proving support.');
  if (!capabilities.bdd_validation) recs.push('Run "npm install" to install devDependencies.');
  if (!hasError && capabilities.bdd_validation && capabilities.tla_plus) {
    recs.push('Environment ready! Start with: npx tsx index.ts pipeline --src <srs-file> --lang zh --workdir .srs_formalizer');
  }

  return recs;
}

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
