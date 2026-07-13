# 子项目 2：Middle-end — 实现计划

**日期**: 2026-07-13 | **范围**: 编译器架构重构 Phase 2
**来源**: `docs/DESIGN.md` §6
**前置**: 子项目 1 完成（SRS-IR 类型 + Frontend，361 tests pass，worktree: `feat/subproject-1-ir-frontend`）

---

## 1. 范围

移植 M1/M2/M5 到 SRSIR + 新建 M3/M4/M6。

### 1.1 交付物

| 类别 | 文件 | 操作 | 行数 |
|------|------|:--:|:--:|
| **lib 移植** | `lib/graph-algorithms.ts` | 修改 | +40 |
| | `lib/graph-operations.ts` | 修改 | +30 |
| **M3 新建** | `lib/middle-end/nfr-thresholds.ts` | 新建 | 150 |
| | `lib/middle-end/nfr-tagger.ts` | 新建 | 200 |
| **M4 新建** | `lib/middle-end/connectivity-checker.ts` | 新建 | 180 |
| **M6 新建** | `lib/middle-end/risk-scorer.ts` | 新建 | 160 |
| **CLI** | `commands/analyze-structure.ts` | 重写 | 270 |
| | `commands/analyze-graph.ts` | 重写 | 200 |
| | `commands/tag-nfr.ts` | 新建 | 100 |
| | `commands/check-connectivity.ts` | 新建 | 100 |
| | `commands/merge-analysis.ts` | 重写 | 180 |
| | `commands/score-risk.ts` | 新建 | 120 |
| **入口** | `index.ts` | 扩展 | +6 |
| **测试** | `__tests__/middle-end-nfr-thresholds.test.ts` | 新建 | 160 |
| | `__tests__/middle-end-nfr-tagger.test.ts` | 新建 | 200 |
| | `__tests__/middle-end-connectivity.test.ts` | 新建 | 160 |
| | `__tests__/middle-end-risk-scorer.test.ts` | 新建 | 140 |
| | `__tests__/middle-end-pipeline.test.ts` | 新建 | 150 |
| | `__tests__/analyze-structure.test.ts` | 重写 | 180 |
| | `__tests__/analyze-graph.test.ts` | 重写 | 200 |
| | `__tests__/merge-analysis.test.ts` | 重写 | 160 |

### 1.2 淘汰

| 文件 | 操作 |
|------|:--:|
| 旧 analyze-structure.test.ts | zip 归档 |
| 旧 analyze-graph.test.ts | zip 归档 |
| 旧 merge-analysis.test.ts | zip 归档 |

---

## 2. 技术设计（摘要）

详细设计已展示并获批准。关键点：

- **M1**: findOrphans/findDanglingEdges/findConceptIslands + findCrossFileIslands（新），签名 `Graph → SRSIR`
- **M2**: findDuplicatePairs/findConflictPairs/findSameAspectClusters，NFR 节点隔离
- **M3**: 正则 + 启发式阈值提取（6类×5模式），NFR 节点标注
- **M4**: shard 邻接矩阵 + BFS + 关键词相似度桥接建议
- **M5**: applyMergeNodes/applyAddConflictEdge/applyAddSameAspectEdge，操作对象 `Graph → SRSIR`
- **M6**: 加权风险评分（crossFileCoverage×0.3 + nfrCoverage×0.3 + orphanRate×0.2 + gapWeight×0.2）

---

## 3. 验证标准

```bash
npx tsc --noEmit                            # 0 errors
npx tsx --test __tests__/*.test.ts          # 全部 pass
```

---

## 4. 不变约束

继承自 AGENTS.md：零运行时 npm 依赖、Strict TS、0 `any`、max 300 lines/file、`path.join()` only、poison values rejected、`refuseDirectInvocation` guard、JSON CLI output。
