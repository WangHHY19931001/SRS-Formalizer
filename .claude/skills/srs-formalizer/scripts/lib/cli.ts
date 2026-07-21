import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Shared CLI argument utilities.
 * All srs-formalizer commands MUST use safeParseArg — it rejects
 * LLM-generated garbage values (undefined, null, empty string).
 */

/** Values that are never valid CLI arguments — reject them. */
const POISON_VALUES = new Set(['undefined', 'null', 'NaN', 'Infinity', '-Infinity', '[object Object]']);

/**
 * Scan ALL positional arguments for poison values. Call this at the
 * entry point (index.ts) before dispatching to any command.
 * This catches LLM-generated garbage that safeParseArg misses because
 * it only checks named flag values, not bare positional args.
 */
export function validateNoPoisonArgs(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (POISON_VALUES.has(arg)) {
      const pos = i + 1; // 1-based for readability
      const nearby = args.slice(Math.max(0, i - 1), i + 2).join(' ');
      throw new Error(
        `PoisonArgument at position #${pos}: "${arg}" in [${nearby}]. ` +
        `This is likely a prompt template bug — an unreplaced {{variable}}. ` +
        `Re-read SKILL.md §"快速参考" for correct command signatures.`
      );
    }
  }
}

/**
 * Parse a named argument (--key value).
 * Rejects: missing value, poison values, empty strings, whitespace-only,
 * duplicate flag occurrences (per design §7.3: 重复参数必须返回 error).
 * Returns the validated value or null if the key is not present.
 */
export function safeParseArg(args: string[], name: string): string | null {
  // Count flag occurrences — duplicates are rejected per design §7.3:
  //   "未知名称、未注册组或重复参数必须返回 { status: "error" } 并以非零退出"
  let count = 0;
  for (const a of args) {
    if (a === name) count++;
  }
  if (count === 0) return null;
  if (count > 1) {
    throw new Error(
      `InvalidArgument: ${name} appears ${count} times. ` +
      `Duplicate flag parameters are rejected per design §7.3. ` +
      `Check your orchestrator prompt or command construction.`
    );
  }

  // Single occurrence — extract the value that follows the flag
  const idx = args.indexOf(name);
  if (idx + 1 >= args.length) {
    throw new Error(
      `InvalidArgument: ${name} is missing a value (flag at end of args).`
    );
  }
  const raw = args[idx + 1]!;

  // Reject literal poison values that LLMs sometimes emit
  if (POISON_VALUES.has(raw)) {
    throw new Error(
      `InvalidArgument: ${name} received poison value "${raw}". ` +
      `This is likely a prompt template bug — an unreplaced {{variable}}. ` +
      `Check your orchestrator prompt or command construction.`
    );
  }

  // Reject empty or whitespace-only
  if (raw.trim() === '') {
    throw new Error(`InvalidArgument: ${name} received empty value.`);
  }

  return raw;
}

/**
 * Validate that a workdir path ends with .srs_formalizer.
 */
export function validateWorkDir(outputArg: string): string {
  const basename = path.basename(path.resolve(outputArg));
  if (basename !== '.srs_formalizer') {
    throw new Error(
      `SecurityError: Output directory must be ".srs_formalizer", got "${basename}".`
    );
  }
  return path.resolve(outputArg);
}

/**
 * Backward-compatible: isPathSafe and assertSafePath.
 */
function resolvePath(targetPath: string): string {
  const parts = targetPath.split(path.sep);
  let resolved = '';
  for (const part of parts) {
    if (part === '' && resolved === '') {
      resolved = path.sep;
      continue;
    }
    const candidate = resolved + (resolved === path.sep ? '' : path.sep) + part;
    try {
      resolved = fs.realpathSync(candidate);
    } catch {
      resolved = candidate;
    }
  }
  return resolved;
}

export function isPathSafe(targetPath: string, workDir: string): boolean {
  // Normalise separators to '/' for the containment comparison. resolvePath
  // splits on path.sep, so on Windows a POSIX-style path (or vice-versa) would
  // never split and the `+ path.sep` boundary check would mix separators,
  // wrongly rejecting in-workdir paths. Comparing on a single canonical
  // separator keeps the boundary check correct on every platform.
  const toPosix = (p: string): string => p.split(path.sep).join('/').replace(/\\/g, '/');
  const resolved = toPosix(resolvePath(targetPath));
  const workDirResolved = toPosix(resolvePath(workDir));
  return resolved === workDirResolved || resolved.startsWith(workDirResolved + '/');
}

export function assertSafePath(targetPath: string, workDir: string): void {
  if (!isPathSafe(targetPath, workDir)) {
    throw new Error(
      `SecurityError: Path "${targetPath}" is outside work directory "${workDir}". Access denied.`
    );
  }
}

/**
 * Guard: refuse direct invocation of command files. All commands MUST be
 * invoked through index.ts. This prevents LLM agents from bypassing the
 * entry point and passing raw/unvalidated arguments.
 *
 * Usage: add at the END of each command file:
 *   import { refuseDirectInvocation } from '../lib/cli.js';
 *   refuseDirectInvocation(import.meta.url);
 */
export function refuseDirectInvocation(importMetaUrl: string): void {
  const scriptPath = process.argv[1];
  if (!scriptPath) return; // Can't determine, allow

  const endsWith = (s: string, suffix: string): boolean =>
    s.endsWith(suffix) || s.endsWith(suffix.replace('.ts', '.js'));

  // Extract the expected sub-path from import.meta.url
  // e.g. file:///.../scripts/commands/init.ts → check if argv[1] ends with commands/init.ts
  const urlPath = new URL(importMetaUrl).pathname;

  if (endsWith(scriptPath, urlPath)) {
    const cmdName = urlPath.split('/').pop()?.replace(/\.(ts|js)$/, '') ?? '?';
    console.error(
      `\n⛔ DIRECT INVOCATION REFUSED\n` +
        `\nYou called:  npx tsx ${scriptPath}` +
        `\nCorrect is:  npx tsx index.ts ${cmdName} [options]` +
        `\n` +
        `\nAll srs-formalizer commands MUST be invoked through index.ts.` +
        `\nRe-read SKILL.md §"快速参考" for the correct command signatures.` +
        `\n`
    );
    process.exit(1);
  }
}
