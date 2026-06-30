/**
 * merge-analysis.ts — 合并子代理语义分析判决（SRS §5.9）
 *
 * CLI: npx tsx index.ts merge-analysis --workdir .srs_formalizer
 *
 * 读取 analysis/ 目录下的子代理判决 JSONL 文件，应用三种判决：
 *   - duplicate  → 合并节点（保留一个，转移所有边）
 *   - conflict   → 添加 :CONFLICTS_WITH 边
 *   - same_aspect → 添加 :SAME_ASPECT 边
 *
 * 输出 graph/graph.merged.json + graph/merge_log.jsonl
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
