/**
 * verify-gate.ts -- 验证关卡命令 (SRS §5.13)
 *
 * CLI: npx tsx index.ts verify-gate --workdir .srs_formalizer --stage S1|R3|FINAL
 *
 * 根据 --stage 执行不同阶段的验证检查：
 * - S1:   基础检查（STATE.md、index.json、r1-explicit JSONL 文件存在）
 * - R3:   S1 检查 + JSONL 存在性（全子目录）、ID 唯一性、图谱可加载、节点数 >= R1 数
 * - FINAL: R3 检查 + validate-bdd 通过、graph.merged.json 存在、schema.cypher 存在、
 *         brainstorm_context.json 存在、MINDMAP.md 全部模块 ✅
*/
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
