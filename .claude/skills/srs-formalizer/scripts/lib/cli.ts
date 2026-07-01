import * as path from 'node:path';

/**
 * Shared CLI argument utilities.
 * All srs-formalizer commands MUST use safeParseArg — it rejects
 * LLM-generated garbage values (undefined, null, empty string).
 */

/** Values that are never valid CLI arguments — reject them. */
const POISON_VALUES = new Set(['undefined', 'null', 'NaN', 'Infinity', '-Infinity', '[object Object]']);

/**
 * Parse a named argument (--key value).
 * Rejects: missing key, poison values, empty strings, whitespace-only.
 * Returns the validated value or null if the key is not present.
 */
export function safeParseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
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
export function isPathSafe(targetPath: string, workDir: string): boolean {
  const resolved = path.resolve(targetPath);
  const workDirResolved = path.resolve(workDir);
  return resolved.startsWith(workDirResolved + path.sep) || resolved === workDirResolved;
}

export function assertSafePath(targetPath: string, workDir: string): void {
  if (!isPathSafe(targetPath, workDir)) {
    throw new Error(
      `SecurityError: Path "${targetPath}" is outside work directory "${workDir}". Access denied.`
    );
  }
}
