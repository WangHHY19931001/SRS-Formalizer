/**
 * build-graph.ts — 构建需求知识图谱命令
 *
 * CLI: npx tsx index.ts build-graph --workdir .srs_formalizer
 *
 * 从 r1-explicit/, r2-implicit/, r3-relational/ 下的所有 JSONL 文件构建图谱。
 * 按 id 去重（保留首次出现），根据 category 设置节点标签，
 * 从 metadata 提取边（derived_from → :DERIVED_FROM, relation → :DEPENDS_ON|:REFINES|:CONFLICTS_WITH）。
 * 输出到 graph/graph.json。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
