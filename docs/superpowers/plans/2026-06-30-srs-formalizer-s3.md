# SRS-Formalizer S3 阶段实现计划

> 使用 superpowers:subagent-driven-development 逐任务实现。

**目标：** 实现 S3 阶段——图谱构建 → 结构补全 → 语义去重 → Cypher 导出。含 7 个 TS 脚本 + 3 个库文件 + 3 个提示词 + 编排者指令。

**架构：** V 模型。图算法纯 TS 实现（确定性的 BFS/DFS/邻接表），Jaccard 去重 + Louvain 社区检测预留 Rust 加速接口。子代理仅做语义判断（结构补全/去重判定）。

**技术栈：** TypeScript 5.5+（strict）、Node.js ≥20、零外部依赖

---

## 任务顺序

```
Phase A:  [任务 1-3]   图算法基础设施（lib/graph.ts, lib/traversal.ts, lib/cypher.ts）
Phase A.5:[任务 4-5]   测试正确性设计（可追溯矩阵 + 断言审查）
Phase B:  [任务 6-12]  ⭐ 全部测试先行（L4→L3→L2，7 脚本 × ~8 用例 = ~56 用例）
Phase C:  [任务 13]    两阶段 RED 确认
Phase D:  [任务 14-16]  子代理提示词（executor-R4-verify/clarify + verifier-R4）
Phase E:  [任务 17-23] TS 编码（TDD GREEN，7 脚本逐个击破）
Phase F:  [任务 24]    S3 编排者提示词
Phase G:  [任务 25]    逐级回归校验 → S3 完成
```

---

## S3 关键设计决策

### 图数据结构（lib/graph.ts）
```typescript
interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
  adjacency: Map<string, Set<string>>;  // 邻接表
  reverseAdjacency: Map<string, Set<string>>;  // 反向索引
}

interface Node {
  id: string;
  labels: string[];         // Requirement, ImplicitRequirement, Module, Actor, etc.
  properties: Record<string, unknown>;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;             // DERIVED_FROM, DEPENDS_ON, CONFLICTS_WITH, etc.
  properties?: Record<string, unknown>;
}
```

### 图遍历算法（lib/traversal.ts）
- BFS/DFS 路径查找 O(V+E)
- 孤立节点检测（入度=0 且 出度=0）
- 悬挂边检测（边目标不存在）
- 概念孤岛（聚类计数）
- Jaccard 相似度（可选 Rust 加速）

### TS 脚本清单（7 个）

| 脚本 | 输入 | 输出 | 算法 |
|------|------|------|------|
| `build-graph.ts` | JSONL 文件 | `graph/graph.json` | 节点创建 + 边建立 + 邻接表 |
| `analyze-structure.ts` | `graph/graph.json` | 缺陷清单 + 子代理提示词 | BFS 孤立/悬挂/孤岛检测 |
| `merge-structure.ts` | 缺陷清单 + 补全建议 | `graph.structure_fixed.json` | 确定性合并 |
| `analyze-graph.ts` | `graph.structure_fixed.json` | 疑似重复/冲突/同侧面 | Jaccard + 社区检测 |
| `merge-analysis.ts` | 分析清单 + 子代理判决 | `graph.merged.json` | 确定性合并 |
| `export-cypher.ts` | `graph.merged.json` | `outputs/knowledge_graph/schema.cypher` | 遍历→CREATE 语句 |
| `verify-gate.ts` | 工作目录 + --stage R3 | `{"pass":true/false}` | 确定性校验 |

---

## Phase A：图算法基础设施

### 任务 1：lib/graph.ts — 图数据结构

创建 `Graph` 类：`addNode`, `addEdge`, `getNode`, `getNeighbors`, `toJSON`, `fromJSON`。

### 任务 2：lib/traversal.ts — 图遍历算法

`bfs`, `dfs`, `findOrphans`, `findDanglingEdges`, `findConceptIslands`, `jaccardSimilarity`, `findPaths`。

### 任务 3：lib/cypher.ts — Cypher 生成器

`generateCreateNode`, `generateCreateEdge`, `generateConstraints`, `generateFullScript`。

---

## Phase B：全部测试先行（7 个测试文件）

每个脚本对应一个 `__tests__/<name>.test.ts`，覆盖正常/边界/错误路径。S3 的测试夹具包含手工构造的小型图谱（~10 节点）用于确定性验证。

---

## Phase D：子代理提示词（3 个）

- `executor-R4-verify.md`：矛盾检测（读取疑似冲突对 → 判定是否真正冲突）
- `executor-R4-clarify.md`：信号澄清（读取模糊需求 → 建议澄清方案）
- `verifier-R4.md`：审核 R4 判定（编造检测/遗漏/合理性）

---

## Phase E：编码顺序（依赖图决定）

```
build-graph ──→ analyze-structure ──→ merge-structure
                    ↓
              analyze-graph ──→ merge-analysis
                    ↓
              export-cypher

verify-gate（R3 阶段，依赖以上全部）
```

---

## 自检
- SRS §5.5-5.13 全量覆盖
- 图算法全部 O(V+E) 保证
- Jaccard/Louvain 预留 native-bridge 接口
