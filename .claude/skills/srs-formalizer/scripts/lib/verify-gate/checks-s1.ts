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
  const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
  const exists = fs.existsSync(indexPath);
  return {
    name: '_ctx/shard_index.json exists',
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

/**
 * S1: shard EXTRACTION coverage (proposal §P0-0a/0b/0c). The pre-existing
 * `checkShardCompleteness` only verifies each shard's `source_path` exists — it
 * never checks that每个分片都真的产出了 R1 提取。This gate closes the "33% shards
 * zero-extraction still green" hole (§3.0.1) by expanding every R1 record id
 * `R1-<shardId>-NNNN` into the shard it covers and diffing against the full
 * shard set from `shard_index.json`.
 *
 * Interval-named files (e.g. `S001_S003.jsonl`) can no longer mask a gap because
 * coverage is keyed on the shard segment of each record id, not the file name
 * (§0b). A shard that legitimately carries no normative content must be declared
 * explicitly in `2_extract/r1-explicit/_empty_shards.json` (a JSON string array
 * of shard ids); silent absence is a FAIL.
 */
export function checkShardCoverage(workDir: string): CheckResult {
  const name = 'Shard extraction coverage';
  try {
    const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
    if (!fs.existsSync(indexPath)) {
      return { name, passed: false, detail: 'shard_index.json not found' };
    }
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const shards: Array<{ id?: string; chapter_ref?: string }> = index.shards || [];
    if (shards.length === 0) {
      return { name, passed: true, detail: 'No shards declared in shard_index.json' };
    }

    const chapterById = new Map<string, string>();
    for (const shard of shards) {
      if (typeof shard.id === 'string') chapterById.set(shard.id, shard.chapter_ref ?? '');
    }

    const covered = new Set<string>();
    const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
    if (fs.existsSync(r1Dir)) {
      for (const filePath of listJsonlFiles(r1Dir, workDir)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          let record: { id?: unknown };
          try { record = JSON.parse(trimmed) as { id?: unknown }; } catch { continue; }
          if (typeof record.id !== 'string') continue;
          const parts = record.id.split('-');
          if (parts.length >= 3) covered.add(parts.slice(1, -1).join('-'));
        }
      }
    }

    const emptyMarkerPath = path.join(r1Dir, '_empty_shards.json');
    if (fs.existsSync(emptyMarkerPath)) {
      try {
        const declared = JSON.parse(fs.readFileSync(emptyMarkerPath, 'utf-8'));
        if (Array.isArray(declared)) for (const id of declared) if (typeof id === 'string') covered.add(id);
      } catch { /* malformed marker ignored — shard stays uncovered */ }
    }

    const missing = [...chapterById.keys()].filter(id => !covered.has(id));
    if (missing.length === 0) {
      return { name, passed: true, detail: `All ${chapterById.size} shard(s) have R1 extraction` };
    }
    const sample = missing.slice(0, 8).map(id => {
      const chapter = chapterById.get(id);
      return chapter ? `${id}(${chapter})` : id;
    }).join(', ');
    return {
      name,
      passed: false,
      detail: `${missing.length}/${chapterById.size} shard(s) with ZERO extraction: ${sample}${missing.length > 8 ? ' …' : ''}. Extract them or declare intentionally-empty shards in r1-explicit/_empty_shards.json`,
    };
  } catch {
    return { name, passed: false, detail: 'Could not verify shard coverage' };
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
