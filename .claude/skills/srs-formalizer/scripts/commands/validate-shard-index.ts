/**
 * validate-shard-index.ts — ShardIndex schema 校验
 *
 * CLI: npx tsx index.ts validate-shard-index --workdir .srs_formalizer
 *
 * 校验 _ctx/shard_index.json 符合 types/index.ts 的 ShardIndex 定义：
 * - 顶层字段：version="1.0"|"1.1", source_path, source_hash, language, total_chars, total_shards, shards[], gaps[], warnings[]
 * - ShardEntry：id, file, locator, source_path, source_start_line, source_end_line, module, chapter_ref, char_count, estimated_tokens
 * - shard id 格式 ^S\d{3}$
 * - source_start_line < source_end_line
 * - total_shards == shards.length
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';

const SHARD_ID_REGEX = /^S\d{3}$/;
const LOCATOR_REGEX = /^.+-\d+-\d+-[A-Za-z0-9_-]+$/;

interface ValidationError {
  field: string;
  message: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function validateShardIndex(raw: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (!isObject(raw)) {
    return { valid: false, errors: [{ field: 'root', message: 'shard_index must be a JSON object' }] };
  }

  // 顶层字段
  const version = toStr(raw['version']);
  if (version !== '1.0' && version !== '1.1') {
    errors.push({ field: 'version', message: `version must be "1.0" or "1.1", got "${version}"` });
  }
  if (toStr(raw['source_path']) === '') errors.push({ field: 'source_path', message: 'source_path missing or not string' });
  if (toStr(raw['source_hash']) === '') errors.push({ field: 'source_hash', message: 'source_hash missing or not string' });
  const lang = toStr(raw['language']);
  if (lang !== 'zh' && lang !== 'en') {
    errors.push({ field: 'language', message: `language must be "zh" or "en", got "${lang}"` });
  }
  if (toNum(raw['total_chars']) === null) errors.push({ field: 'total_chars', message: 'total_chars missing or not number' });
  if (toNum(raw['total_shards']) === null) errors.push({ field: 'total_shards', message: 'total_shards missing or not number' });
  if (!Array.isArray(raw['shards'])) errors.push({ field: 'shards', message: 'shards must be an array' });
  if (!Array.isArray(raw['gaps'])) errors.push({ field: 'gaps', message: 'gaps must be an array' });
  if (!Array.isArray(raw['warnings'])) errors.push({ field: 'warnings', message: 'warnings must be an array' });

  // shards[] 字段
  if (Array.isArray(raw['shards'])) {
    const shards = raw['shards'] as unknown[];
    const totalShards = toNum(raw['total_shards']);
    if (totalShards !== null && totalShards !== shards.length) {
      errors.push({ field: 'total_shards', message: `total_shards (${totalShards}) != shards.length (${shards.length})` });
    }
    for (let i = 0; i < shards.length; i++) {
      const s = shards[i];
      if (!isObject(s)) {
        errors.push({ field: `shards[${i}]`, message: 'shard must be object' });
        continue;
      }
      const id = toStr(s['id']);
      if (!SHARD_ID_REGEX.test(id)) {
        errors.push({ field: `shards[${i}].id`, message: `id "${id}" must match ^S\\d{3}$` });
      }
      if (toStr(s['file']) === '') errors.push({ field: `shards[${i}].file`, message: 'file missing' });
      const locator = toStr(s['locator']);
      if (!LOCATOR_REGEX.test(locator)) {
        errors.push({ field: `shards[${i}].locator`, message: `locator "${locator}" must match {abspath}-{start}-{end}-{chunk_id}` });
      }
      if (toStr(s['source_path']) === '') errors.push({ field: `shards[${i}].source_path`, message: 'source_path missing' });
      const startLine = toNum(s['source_start_line']);
      const endLine = toNum(s['source_end_line']);
      if (startLine === null || startLine < 1) errors.push({ field: `shards[${i}].source_start_line`, message: 'must be positive number' });
      if (endLine === null || endLine < 1) errors.push({ field: `shards[${i}].source_end_line`, message: 'must be positive number' });
      if (startLine !== null && endLine !== null && startLine > endLine) {
        errors.push({ field: `shards[${i}].source_start_line`, message: `source_start_line (${startLine}) > source_end_line (${endLine})` });
      }
      if (toStr(s['module']) === '') errors.push({ field: `shards[${i}].module`, message: 'module missing' });
      if (toStr(s['chapter_ref']) === '') errors.push({ field: `shards[${i}].chapter_ref`, message: 'chapter_ref missing' });
      if (toNum(s['char_count']) === null) errors.push({ field: `shards[${i}].char_count`, message: 'char_count missing' });
      if (toNum(s['estimated_tokens']) === null) errors.push({ field: `shards[${i}].estimated_tokens`, message: 'estimated_tokens missing' });
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
  if (!fs.existsSync(indexPath)) {
    return { status: 'error', message: `shard_index.json not found: ${indexPath}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch (err) {
    return { status: 'error', message: `Failed to parse shard_index.json: ${(err as Error).message}` };
  }

  const result = validateShardIndex(raw);
  if (!result.valid) {
    return {
      status: 'error',
      message: `ShardIndex schema validation failed (${result.errors.length} errors)`,
      data: { errors: result.errors },
    };
  }
  return {
    status: 'ok',
    data: { valid: true, shardCount: (raw as { total_shards: number }).total_shards },
  };
}

refuseDirectInvocation(import.meta.url);
