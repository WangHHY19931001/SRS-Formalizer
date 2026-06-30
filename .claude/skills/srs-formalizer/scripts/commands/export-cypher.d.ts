/**
 * export-cypher.ts -- 导出 Cypher 脚本命令 (SRS §5.10)
 *
 * CLI: npx tsx index.ts export-cypher --workdir .srs_formalizer
 *
 * 读取 graph/graph.merged.json（如不存在则 graph.structure_fixed.json，
 * 再不存则 graph/graph.json），调用 lib/cypher.js 的 generateFullScript
 * 生成完整 Cypher 脚本，输出到 outputs/knowledge_graph/schema.cypher。
 *
 * 确定性：相同图谱生成相同 Cypher 脚本。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
