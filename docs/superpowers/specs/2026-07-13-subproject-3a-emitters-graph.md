# 子项目 3A：Backend 图谱组 Emitter — 实现计划

**日期**: 2026-07-13 | **范围**: 编译器架构重构 Phase 3A
**来源**: `docs/DESIGN.md` §7
**前置**: 子项目 2 完成（Middle-end，391 tests pass）

---

## 1. 范围

实现图谱组 4 个 Emitter：CypherEmitter, BehaviorGraphEmitter, TlaGraphEmitter, LeanGraphEmitter + Emitter 接口 + emit CLI。

### 1.1 交付物

| 类别 | 文件 | 操作 | 行数 |
|------|------|:--:|:--:|
| Emitter 接口 | `lib/emitters/types.ts` | 新建 | 30 |
| Cypher | `lib/emitters/cypher-emitter.ts` | 新建 | 200 |
| BehaviorGraph | `lib/emitters/behavior-graph-emitter.ts` | 新建 | 160 |
| TlaGraph | `lib/emitters/tla-graph-emitter.ts` | 新建 | 140 |
| LeanGraph | `lib/emitters/lean-graph-emitter.ts` | 新建 | 140 |
| CLI | `commands/emit.ts` | 新建 | 180 |
| 入口 | `index.ts` | 扩展 | +2 |
| 测试 x5 | `__tests__/emitters-*.test.ts` | 新建 | 750 |

### 1.2 移植来源

| Emitter | 参考旧文件（zip 归档） |
|------|------|
| CypherEmitter | `commands/export-cypher.ts` + `lib/cypher.ts` |
| BehaviorGraphEmitter | `commands/build-behavior-graph.ts` + `lib/behavior-graph.ts` |
| TlaGraphEmitter | `commands/build-tla-graph.ts` + `lib/tla-graph.ts` |
| LeanGraphEmitter | `commands/build-lean-graph.ts` + `lib/lean-graph.ts` |

---

## 2. 验证标准

```bash
npx tsc --noEmit && npx tsx --test __tests__/*.test.ts  # 全部 pass
```

---

## 3. 不变约束

零运行时 npm 依赖、Strict TS、0 `any`、max 300 lines/file、`path.join()` only、refuseDirectInvocation、JSON CLI output。
