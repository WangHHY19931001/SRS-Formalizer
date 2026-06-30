/**
 * validate-jsonl.ts — JSONL 文件校验命令
 *
 * CLI: npx tsx index.ts validate-jsonl --file <path> --workdir <path>
 *
 * 6 项检查：合法 JSON / 必填字段 / id 格式 / category 枚举 / 空 statement / 重复 id
 *
 * 复用 lib/jsonl.ts 的 readJsonl + validateJsonlRecord 函数
 * 复用 lib/security.ts 的 isPathSafe + validateWorkDir
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
