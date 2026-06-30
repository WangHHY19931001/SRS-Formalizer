/**
 * merge-structure.ts — 合并子代理结构补全建议命令
 *
 * CLI: npx tsx index.ts merge-structure --workdir .srs_formalizer
 *
 * 读取 analysis/ 下的子代理补全 JSONL 文件，应用三种操作：
 *   - add_relation:    添加新边
 *   - fix_dangling:    修正悬挂边的目标节点
 *   - add_requirement: 添加新的 SupplementalRequirement 节点
 *
 * 输出 graph/graph.structure_fixed.json + graph/structure_merge_log.jsonl
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
