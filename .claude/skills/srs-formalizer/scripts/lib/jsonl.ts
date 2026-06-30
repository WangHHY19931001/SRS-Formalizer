import * as fs from 'node:fs';
import * as path from 'node:path';
import { JsonlRecord } from '../types/index.js';

/** Resolve and validate that `target` is within `workdir`. */
function resolveSafe(target: string, workdir: string): string {
  const absTarget = path.resolve(workdir, target);
  const absWorkdir = path.resolve(workdir);
  if (!absTarget.startsWith(absWorkdir + path.sep) && absTarget !== absWorkdir) {
    throw Object.assign(new Error(`SecurityError: path "${target}" is outside workdir "${workdir}"`), { code: 'SecurityError' });
  }
  return absTarget;
}

/**
 * Write an array of records as newline-delimited JSON.
 * Creates parent directories if they don't exist.
 */
export function writeJsonl(filePath: string, records: JsonlRecord[], workdir: string): void {
  const absPath = resolveSafe(filePath, workdir);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(absPath, lines, 'utf-8');
}

/**
 * Read a newline-delimited JSON file into an array.
 * - Empty lines are silently skipped.
 * - Malformed JSON lines throw with details.
 */
export function readJsonl(filePath: string, workdir: string): JsonlRecord[] {
  const absPath = resolveSafe(filePath, workdir);
  const raw = fs.readFileSync(absPath, 'utf-8');
  const lines = raw.split('\n');
  const result: JsonlRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    try {
      const parsed = JSON.parse(line);
      result.push(parsed as JsonlRecord);
    } catch (e) {
      throw new Error(`JSONL parse error at line ${i + 1}: ${(e as Error).message}`);
    }
  }

  return result;
}
