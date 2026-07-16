/**
 * checks.ts — Environment and project-file health checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { HealthCheck } from './types.js';

export function checkNodeVersion(): HealthCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0] ?? '0', 10);
  if (major >= 20) {
    return { name: 'node_version', status: 'ok', message: `Node.js ${version} (>=20 required)`, details: { version, major } };
  }
  return { name: 'node_version', status: 'error', message: `Node.js ${version} is too old (>=20 required)`, details: { version, major } };
}

export function checkCommand(name: string, args: string[] = ['--version']): { available: boolean; output?: string | undefined } {
  try {
    const rawOutput = execSync(`${name} ${args.join(' ')}`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const firstLine = rawOutput.trim().split('\n')[0];
    return { available: true, output: firstLine };
  } catch {
    return { available: false, output: undefined };
  }
}

export function checkJava(): HealthCheck {
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

export function checkLean(): HealthCheck {
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

export function checkProjectFiles(scriptDir: string): HealthCheck[] {
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
