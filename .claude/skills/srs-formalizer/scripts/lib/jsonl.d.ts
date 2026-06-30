import type { JsonlRecord } from '../types/index.js';
export declare function readJsonl(filePath: string, workDir: string): JsonlRecord[];
export declare function writeJsonl(filePath: string, records: JsonlRecord[], workDir: string): void;
export declare function listJsonlFiles(dirPath: string, workDir: string): string[];
/**
 * 校验单条 JSONL 记录。返回错误字符串数组，空数组表示通过。
 * 检查项：① 必填字段存在 ② id 格式 R[123]-[A-Za-z0-9_.]+-\d{4}
 * ③ category 枚举 ④ 空 statement ⑤ confidence 枚举
 */
export declare function validateJsonlRecord(record: JsonlRecord, index: number): string[];
