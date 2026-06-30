/**
 * build-architecture.ts — 构建架构图命令
 *
 * CLI: npx tsx index.ts build-architecture --workdir .srs_formalizer
 *
 * 读取 2_extract/architecture/ 下的 JSONL 文件（arch-1, arch-2, arch-3），
 * 创建 Module / Actor / Constraint 节点和 CONTAINS / PARENT_OF 边，
 * 合并入现有知识图谱。
 * 输出 3_graph/graph/graph.with_architecture.json。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
