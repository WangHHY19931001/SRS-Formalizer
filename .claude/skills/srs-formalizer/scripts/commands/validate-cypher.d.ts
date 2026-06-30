/**
 * validate-cypher.ts — Cypher 脚本文件校验命令
 *
 * CLI: npx tsx index.ts validate-cypher --file <path>
 *
 * 校验 .cypher 文件：
 *   1. 文件非空
 *   2. 含 CREATE 或 MATCH 语句
 *   3. 每行分号结尾（或 CREATE/MATCH 后跟分号）
 *   4. 不含明显语法错误（如未闭合的引号、括号不匹配）
 *
 * 输出：{"status":"ok","data":{"valid":true/false,"errors":[...]}}
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
