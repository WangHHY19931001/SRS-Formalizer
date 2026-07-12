/**
 * Shared filesystem helpers used by multiple command modules.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function writeJsonlFile(filePath: string, records: unknown[]): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const content = records
    .filter(r => r !== undefined && r !== null)
    .map(r => JSON.stringify(r))
    .join('\n');
  fs.writeFileSync(filePath, content + (records.length > 0 ? '\n' : ''), 'utf-8');
}
