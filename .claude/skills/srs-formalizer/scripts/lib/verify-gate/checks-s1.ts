/**
 * checks-s1.ts — S1 stage verification checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { listJsonlFiles } from '../jsonl.js';
import type { CheckResult } from './shared.js';

export function checkStateMd(workDir: string): CheckResult {
  const statePath = path.join(workDir, 'STATE.md');
  const exists = fs.existsSync(statePath);
  return {
    name: 'STATE.md exists',
    passed: exists,
    detail: exists ? 'Found' : `STATE.md not found at ${statePath}`,
  };
}

export function checkShardIndex(workDir: string): CheckResult {
  const indexPath = path.join(workDir, '1_input', 'shard_index.json');
  const exists = fs.existsSync(indexPath);
  return {
    name: '1_input/shard_index.json exists',
    passed: exists,
    detail: exists ? 'Found' : `shard_index.json not found at ${indexPath}`,
  };
}

export function checkR1HasJsonlFiles(workDir: string): CheckResult {
  const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
  let fileCount = 0;
  if (fs.existsSync(r1Dir)) {
    try {
      fileCount = listJsonlFiles(r1Dir, workDir).length;
    } catch { /* ignore */ }
  }
  return {
    name: 'r1-explicit has JSONL files',
    passed: fileCount > 0,
    detail: fileCount > 0 ? `${fileCount} file(s)` : 'No JSONL files in r1-explicit/',
  };
}

/** S1: 验证 shard_index.json 中每个分片的 source_path 实际存在 */
export function checkShardCompleteness(workDir: string): CheckResult {
  try {
    const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
    if (!fs.existsSync(indexPath)) {
      return { name: 'Shard completeness', passed: false, detail: 'shard_index.json not found' };
    }
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const shards = index.shards || [];
    const missingSources: string[] = [];
    const seenSources = new Set<string>();

    for (const shard of shards) {
      const key = shard.source_path;
      if (seenSources.has(key)) continue;
      seenSources.add(key);
      if (!fs.existsSync(shard.source_path)) {
        missingSources.push(shard.source_path);
      }
    }

    return {
      name: 'Shard completeness',
      passed: missingSources.length === 0,
      detail: missingSources.length === 0
        ? `All ${shards.length} shards reference existing source files`
        : `Missing source files: ${missingSources.slice(0, 3).join(', ')}`,
    };
  } catch {
    return { name: 'Shard completeness', passed: false, detail: 'Could not verify shards' };
  }
}

export function checkGlossaryExists(workDir: string): CheckResult {
  const glossaryMd = path.join(workDir, 'GLOSSARY.md');
  const ctxDir = path.join(workDir, '_ctx');
  const batchFiles = fs.existsSync(ctxDir)
    ? fs.readdirSync(ctxDir).filter(f => /^glossary-B\d{2}\.json$/.test(f))
    : [];

  if (fs.existsSync(glossaryMd)) {
    return { name: 'GLOSSARY.md exists', passed: true, detail: 'Found (merged output)' };
  }
  if (batchFiles.length > 0) {
    return {
      name: 'GLOSSARY.md exists',
      passed: false,
      detail: `Not merged — ${batchFiles.length} batch file(s) in _ctx/ awaiting merge`,
    };
  }
  return { name: 'GLOSSARY.md exists', passed: false, detail: 'Not found — run S1 step 4 glossary extraction' };
}
