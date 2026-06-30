/**
 * query-graph.ts -- 图查询与遍历接口 (SRS §5.14)
 *
 * CLI: npx tsx index.ts query-graph --workdir .srs_formalizer --query <type> --params '<json>'
 *
 * 7 种查询类型：
 *   get-node          params: {"id":"..."}          → 节点详情
 *   get-neighbors     params: {"id":"..."}          → 邻接节点列表
 *   get-module        params: {"module":"..."}      → 该模块下所有节点
 *   list-modules      --params 可省略                → 所有模块名
 *   find-path         params: {"from":"...","to":"..."} → BFS 最短路径
 *   get-context       params: {"id":"..."}          → 2 跳邻域
 *   export-brainstorm --params 可省略                → 输出全量数据
 *
 * 确定性：相同查询参数 → 相同输出。
 * 性能：单次查询 ≤5s，路径 BFS O(V+E)。
 */
import type { CliResult } from '../types/index.js';
export declare function main(args: string[]): Promise<CliResult>;
