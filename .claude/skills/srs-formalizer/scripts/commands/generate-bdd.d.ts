/**
 * generate-bdd.ts -- 从需求图谱生成 Gherkin BDD 骨架 (SRS §5.11)
 *
 * CLI: npx tsx index.ts generate-bdd --workdir .srs_formalizer
 *
 * 读取 graph/graph.merged.json → 按 Module 分组 → 为每个 Module 生成 Feature →
 * 为每个 Requirement 生成 Scenario。输出到 features/<module>.feature。
 *
 * 确定性：相同图谱→相同骨架。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
