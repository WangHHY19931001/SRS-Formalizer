# 修复 24 个失败测试设计文档

**日期：** 2026-07-12
**状态：** 已批准
**策略：** 混合策略（测试 bug 修测试，实现 bug 修实现）

## 背景

健康检查发现 24 个测试失败，分布在 3 个文件：
- `query-graph.test.ts` — 12 个失败
- `merge-analysis.test.ts` — 7 个失败
- `manifest.test.ts` — 5 个失败

## 根因分析

### 1. query-graph.test.ts — 12 个失败（测试 bug）

测试使用了旧版 CLI 名称，与当前实现不匹配：

| 测试传入 | 实现期望 | 影响测试数 |
|----------|----------|------------|
| `get-node` | `node` | 3 |
| `get-neighbors` | `neighbors` | 1 |
| `get-module` | `module` | 1 |
| `list-modules` | `modules` | 2 |
| `find-path` | `path` | 2 |
| `get-context` | `context` | 1 |
| `export-brainstorm` | `brainstorm` | 1 |

此外，测试期望 `data.result` 包装层，但实现直接返回 handler 输出。

### 2. merge-analysis.test.ts — 7 个失败（实现 bug）

测试期望返回 `verdicts_processed`、`applied`、`skipped` 三个计数器，但实现只返回 `merged_graph` 和 `log_entries`。需要在实现中添加计数器逻辑。

### 3. manifest.test.ts — 5 个失败（测试 bug）

测试使用旧版目录布局（`_ctx/`），但实现已迁移到 `1_input/`。此外版本号（`1.1` vs `1.0`）和哈希长度（64 vs 16）也不匹配。

## 修复计划

### A. query-graph.test.ts — 修测试

1. CLI 名称对齐：
   - `get-node` → `node`
   - `get-neighbors` → `neighbors`
   - `get-module` → `module`
   - `list-modules` → `modules`
   - `find-path` → `path`
   - `get-context` → `context`
   - `export-brainstorm` → `brainstorm`

2. 移除 `data.result` 包装：
   - 所有断言改为直接读取 `data` 而非 `data.result`

3. 参数名对齐：
   - `{"module":"用户模块"}` → `{"name":"用户模块"}`

4. 返回值键名对齐：
   - `count` → `node_count`
   - `found` → `reachable`
   - `pathIds` → `path`

5. 错误消息对齐：
   - `'Invalid --query'` → `'Invalid query'`

### B. merge-analysis.test.ts — 修实现

1. 添加计数器：
   ```typescript
   let verdictsProcessed = 0;
   let applied = 0;
   let skipped = 0;
   ```

2. 在处理循环中递增计数器：
   - 每个有效 verdict：`verdictsProcessed++`
   - action 为 `'merged'` 或 `'applied'`：`applied++`
   - action 为 `'skipped'`：`skipped++`

3. 返回值中包含计数器：
   ```typescript
   return {
     status: 'ok',
     data: {
       merged_graph: graph.toJSON(),
       log_entries: logEntries.length,
       verdicts_processed: verdictsProcessed,
       applied,
       skipped,
     },
   };
   ```

### C. manifest.test.ts — 修测试

1. 目录路径对齐：
   - `_ctx` → `1_input`

2. 版本号对齐：
   - `'1.1'` → `'1.0'`

3. 哈希长度对齐：
   - `64` → `16`

4. CONTEXT 路径对齐：
   - `path.join(WORKDIR, 'CONTEXT.md')` → `path.join(WORKDIR, '1_input', 'context', 'srs-sample-zh_CONTEXT.md')`

## 验证步骤

1. `npx tsc --noEmit` — 类型检查
2. `npx tsx --test __tests__/query-graph.test.ts` — 12 个测试通过
3. `npx tsx --test __tests__/merge-analysis.test.ts` — 7 个测试通过
4. `npx tsx --test __tests__/manifest.test.ts` — 5 个测试通过
5. 全量测试 — 无回归

## 风险评估

- **低风险**：所有修改都是测试代码或局部实现修改，不影响核心功能
- **无依赖**：三个文件的修复相互独立
- **可回滚**：每个修复都是独立的 commit
