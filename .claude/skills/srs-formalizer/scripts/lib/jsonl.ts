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

/**
 * 校验单条 JSONL 记录。返回错误字符串数组，空数组表示通过。
 * 检查项：① 必填字段存在 ② id 格式 R[123]-[A-Za-z0-9_.]+-\d{4}
 * ③ category 枚举 ④ 空 statement ⑤ confidence 枚举
 */
export function validateJsonlRecord(
  record: JsonlRecord,
  index: number
): string[] {
  const errors: string[] = [];
  const prefix = `record[${index}]`;

  if (!record.id) errors.push(`${prefix}: missing required field "id"`);
  if (!record.statement) errors.push(`${prefix}: missing required field "statement"`);
  if (!record.source_file) errors.push(`${prefix}: missing required field "source_file"`);

  if (record.id && !/^R[123]-[A-Za-z0-9_.]+-\d{4}$/.test(record.id)) {
    errors.push(`${prefix}: invalid id format "${record.id}", expected R[123]-[A-Za-z0-9_.]+-NNNN`);
  }

  const validCategories = ['explicit', 'implicit', 'relational'];
  if (record.category && !validCategories.includes(record.category)) {
    errors.push(`${prefix}: invalid category "${record.category}", must be one of: ${validCategories.join(', ')}`);
  }

  if (record.statement && record.statement.trim() === '') {
    errors.push(`${prefix}: statement is empty`);
  }

  // P1-4: confidence 接受 'high'|'medium'|'low' 字符串或 0~1 数值
  if (record.confidence !== undefined && record.confidence !== null) {
    if (typeof record.confidence === 'string') {
      if (!['high', 'medium', 'low'].includes(record.confidence)) {
        errors.push(`${prefix}: invalid confidence "${record.confidence}"`);
      }
    } else if (typeof record.confidence === 'number') {
      if (!Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1) {
        errors.push(`${prefix}: confidence number must be in [0, 1], got ${record.confidence}`);
      }
    } else {
      errors.push(`${prefix}: confidence must be string or number, got ${typeof record.confidence}`);
    }
  }

  // P1-5: R3 relational 记录必须含 metadata.relation/source_id/target_id
  if (record.category === 'relational' || /^R3-/.test(record.id)) {
    const meta = record.metadata;
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      errors.push(`${prefix}: R3 relational record missing metadata object`);
    } else {
      const m = meta as Record<string, unknown>;
      const relation = m['relation'];
      if (typeof relation !== 'string' || !['DEPENDS_ON', 'REFINES', 'CONFLICTS_WITH'].includes(relation)) {
        errors.push(`${prefix}: R3 metadata.relation must be one of DEPENDS_ON/REFINES/CONFLICTS_WITH, got ${JSON.stringify(relation)}`);
      }
      if (typeof m['source_id'] !== 'string' || !/^R[123]-[A-Za-z0-9_.]+-\d{4}$/.test(m['source_id'])) {
        errors.push(`${prefix}: R3 metadata.source_id missing or invalid: ${JSON.stringify(m['source_id'])}`);
      }
      if (typeof m['target_id'] !== 'string' || !/^R[123]-[A-Za-z0-9_.]+-\d{4}$/.test(m['target_id'])) {
        errors.push(`${prefix}: R3 metadata.target_id missing or invalid: ${JSON.stringify(m['target_id'])}`);
      }
    }
  }

  return errors;
}
