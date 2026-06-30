/**
 * init.ts — 初始化 .srs_formalizer 工作目录
 *
 * CLI: npx tsx index.ts init --output .srs_formalizer
 * 幂等操作 + 路径安全校验。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
