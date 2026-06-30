/**
 * analyze-graph.ts — 需求知识图谱语义分析命令（SRS §5.8）
 *
 * CLI: npx tsx index.ts analyze-graph --workdir .srs_formalizer
 *
 * 读取 graph/graph.structure_fixed.json（如不存在则读 graph/graph.json），
 * 执行三个维度的分析：
 *   1. Jaccard 相似度 — 识别疑似重复需求
 *   2. 反义检测       — 识别语义冲突
 *   3. 同对象多侧面   — 同一概念对象的不同描述侧面
 *
 * 输出分析结果到 analysis/ 目录，并生成子代理审查提示词。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
