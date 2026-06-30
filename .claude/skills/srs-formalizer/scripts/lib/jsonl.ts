import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonlRecord } from '../types/index.js';
import { assertSafePath } from './security.js';

export function readJsonl(filePath: string, workDir: string): JsonlRecord[] {
  assertSafePath(filePath, workDir);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const records: JsonlRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    try {
      records.push(JSON.parse(line) as JsonlRecord);
    } catch {
      throw new Error(`JSONL parse error at ${filePath}:${i + 1}: invalid JSON`);
    }
  }

  return records;
}

export function writeJsonl(
  filePath: string, records: JsonlRecord[], workDir: string
): void {
  assertSafePath(filePath, workDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function listJsonlFiles(dirPath: string, workDir: string): string[] {
  assertSafePath(dirPath, workDir);
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(dirPath, f));
}
