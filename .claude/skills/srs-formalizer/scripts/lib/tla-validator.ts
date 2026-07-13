import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLED_TLA_JAR = path.resolve(__dirname, '..', '..', 'tools', 'tla2tools-1.7.4.jar');
const SANY_TIMEOUT_MS = 30_000;
const TLC_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 10 * 1024 * 1024;

type ToolRun = { passed: boolean; output: string; exitCode: number | null; durationMs: number };
export interface TlaValidationResult {
  passed: boolean;
  jarPath: string;
  jarVersion: '1.7.4';
  javaVersion: string;
  sany: ToolRun;
  tlc: ToolRun;
}

function commandOutput(error: unknown): string {
  const result = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
  const stdout = result.stdout?.toString() ?? '';
  const stderr = result.stderr?.toString() ?? '';
  return `${stdout}\n${stderr}\n${result.message ?? ''}`.trim().slice(0, 10_000);
}

function commandExitCode(error: unknown): number | null {
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function runJava(args: string[], cwd: string, timeout: number): ToolRun {
  const started = Date.now();
  try {
    const output = execFileSync('java', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: MAX_BUFFER });
    return { passed: true, output: output.slice(0, 10_000), exitCode: 0, durationMs: Date.now() - started };
  } catch (error) {
    return { passed: false, output: commandOutput(error), exitCode: commandExitCode(error), durationMs: Date.now() - started };
  }
}

function javaVersion(): string {
  const result = runJava(['-version'], process.cwd(), SANY_TIMEOUT_MS);
  if (!result.passed) throw new Error(`Java is required for TLA+ verification: ${result.output}`);
  return result.output.match(/version "([^"]+)"/)?.[1] ?? 'unknown';
}

function validateInputs(tlaFile: string, cfgFile: string): void {
  if (!fs.existsSync(BUNDLED_TLA_JAR)) throw new Error(`Bundled TLA+ JAR not found: ${BUNDLED_TLA_JAR}`);
  if (!fs.existsSync(tlaFile)) throw new Error(`TLA+ module not found: ${tlaFile}`);
  if (!fs.existsSync(cfgFile)) throw new Error(`TLA+ configuration not found: ${cfgFile}`);
}

export function validateTla(tlaFile: string, cfgFile: string): TlaValidationResult {
  validateInputs(tlaFile, cfgFile);
  const java = javaVersion();
  const cwd = path.dirname(tlaFile);
  const sany = runJava(['-cp', BUNDLED_TLA_JAR, 'tla2sany.SANY', tlaFile], cwd, SANY_TIMEOUT_MS);
  if (!sany.passed) return { passed: false, jarPath: BUNDLED_TLA_JAR, jarVersion: '1.7.4', javaVersion: java, sany, tlc: { passed: false, output: 'Skipped because SANY failed', exitCode: null, durationMs: 0 } };
  const tlc = runJava(['-cp', BUNDLED_TLA_JAR, 'tlc2.TLC', '-config', cfgFile, tlaFile], cwd, TLC_TIMEOUT_MS);
  return { passed: tlc.passed, jarPath: BUNDLED_TLA_JAR, jarVersion: '1.7.4', javaVersion: java, sany, tlc };
}
