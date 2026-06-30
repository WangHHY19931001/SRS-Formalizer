/**
 * manifest.ts — SRS 分片 + 章节识别 + 信息缺口检测
 *
 * CLI: npx tsx index.ts manifest --src <path> --lang zh|en --workdir .srs_formalizer
 *
 * 五步：合并 → 章节识别 → 缺口检测 → Token 切分 → 写入产出
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
