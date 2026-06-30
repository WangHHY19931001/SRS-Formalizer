/**
 * analyze-structure.ts — 需求知识图谱结构分析命令
 *
 * CLI: npx tsx index.ts analyze-structure --workdir .srs_formalizer
 *
 * 读取 graph/graph.json，调用 traversal.ts 的 findOrphans / findDanglingEdges / findConceptIslands，
 * 输出分析结果到 analysis/ 目录，并生成子代理结构缺口分析提示词。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
