# 修复 24 个失败测试实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复 24 个失败测试，使测试通过率达到 100%

**架构：** 混合策略 — 测试 bug 修测试，实现 bug 修实现。三个文件相互独立，可并行修复。

**技术栈：** TypeScript, Node.js native test runner

---

### 任务 1：修复 query-graph.test.ts（12 个失败）

**文件：**
- 修改：`scripts/__tests__/query-graph.test.ts`

- [ ] **步骤 1：修复 CLI 名称对齐**

将所有 `--query get-*` / `--query list-*` / `--query find-*` / `--query export-*` 替换为短格式：

```typescript
// 替换映射表
const QUERY_RENAMES: Record<string, string> = {
  'get-node': 'node',
  'get-neighbors': 'neighbors',
  'get-module': 'module',
  'list-modules': 'modules',
  'find-path': 'path',
  'get-context': 'context',
  'export-brainstorm': 'brainstorm',
};
```

在每个测试中使用 `--query ${QUERY_RENAMES[oldQuery] ?? oldQuery}`。

- [ ] **步骤 2：移除 data.result 包装**

所有断言改为直接读取 `data` 而非 `data.result`：

```typescript
// 旧代码
const qResult = data.result as Record<string, unknown>;
assert.ok(qResult.found);

// 新代码
assert.ok(data.found);
```

- [ ] **步骤 3：修复参数名对齐**

`get-module` 测试的参数从 `{"module":"用户模块"}` 改为 `{"name":"用户模块"}`。

- [ ] **步骤 4：修复返回值键名对齐**

| 测试 | 旧键名 | 新键名 |
|------|--------|--------|
| get-module | `count` | `node_count` |
| find-path | `found` | `reachable` |
| find-path | `pathIds` | `path` |
| get-context | `nodeCount` | `context.nodes.length` |
| get-context | `edgeCount` | `context.edges.length` |
| export-brainstorm | `nodeCount` | `node_count` |
| export-brainstorm | `edgeCount` | `edge_count` |
| export-brainstorm | `path` | `exported` |
| list-modules | `count` | `modules.length` |

- [ ] **步骤 5：修复错误消息断言**

```typescript
// 旧代码
assert.ok((result.message as string).includes('Invalid --query'));

// 新代码
assert.ok((result.message as string).includes('Invalid query'));
```

- [ ] **步骤 6：运行测试验证通过**

运行：`npx tsx --test __tests__/query-graph.test.ts`
预期：12 个测试通过

- [ ] **步骤 7：Commit**

```bash
git add scripts/__tests__/query-graph.test.ts
git commit -m "fix(test): align query-graph tests with current implementation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 2：修复 merge-analysis.ts（7 个失败）

**文件：**
- 修改：`scripts/commands/merge-analysis.ts`
- 不修改测试（测试期望是正确的）

- [ ] **步骤 1：添加计数器变量**

在 `main()` 函数中，处理循环之前添加：

```typescript
let verdictsProcessed = 0;
let applied = 0;
let skipped = 0;
```

- [ ] **步骤 2：在处理循环中递增计数器**

在每个 `logEntries.push(...)` 之后，根据 action 递增：

```typescript
const lastAction = logEntries[logEntries.length - 1]!.action;
verdictsProcessed++;
if (lastAction === 'merged' || lastAction === 'applied') applied++;
else if (lastAction === 'skipped') skipped++;
```

- [ ] **步骤 3：在返回值中包含计数器**

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

- [ ] **步骤 4：运行测试验证通过**

运行：`npx tsx --test __tests__/merge-analysis.test.ts`
预期：7 个测试通过

- [ ] **步骤 5：Commit**

```bash
git add scripts/commands/merge-analysis.ts
git commit -m "fix(merge-analysis): add missing verdict counters to return value

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 3：修复 manifest.test.ts（5 个失败）

**文件：**
- 修改：`scripts/__tests__/manifest.test.ts`

- [ ] **步骤 1：修复目录路径**

将所有 `_ctx` 替换为 `1_input`：

```typescript
// 旧代码
const indexPath = path.join(WORKDIR, '_ctx', 'shard_index.json');

// 新代码
const indexPath = path.join(WORKDIR, '1_input', 'shard_index.json');
```

- [ ] **步骤 2：修复版本号断言**

```typescript
// 旧代码
assert.equal(index.version, '1.1');

// 新代码
assert.equal(index.version, '1.0');
```

- [ ] **步骤 3：修复哈希长度断言**

```typescript
// 旧代码
assert.equal(index.source_hash.length, 64);

// 新代码
assert.equal(index.source_hash.length, 16);
```

- [ ] **步骤 4：修复 CONTEXT 路径**

```typescript
// 旧代码
const ctx = fs.readFileSync(path.join(WORKDIR, 'CONTEXT.md'), 'utf-8');

// 新代码
const ctx = fs.readFileSync(path.join(WORKDIR, '1_input', 'context', 'srs-sample-zh_CONTEXT.md'), 'utf-8');
```

- [ ] **步骤 5：修复确定性测试的清理路径**

```typescript
// 旧代码
fs.rmSync(path.join(WORKDIR, '_ctx'), { recursive: true, force: true });

// 新代码
fs.rmSync(path.join(WORKDIR, '1_input'), { recursive: true, force: true });
```

- [ ] **步骤 6：运行测试验证通过**

运行：`npx tsx --test __tests__/manifest.test.ts`
预期：5 个测试通过

- [ ] **步骤 7：Commit**

```bash
git add scripts/__tests__/manifest.test.ts
git commit -m "fix(test): align manifest tests with current directory layout

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### 任务 4：全量验证

**文件：**
- 无新增修改

- [ ] **步骤 1：TypeScript 类型检查**

运行：`npx tsc --noEmit`
预期：0 errors

- [ ] **步骤 2：运行全量测试**

运行：`npx tsx --test __tests__/*.test.ts __tests__/fixture-gen/*.test.ts`
预期：所有测试通过（之前 24 个失败 → 0 个失败）

- [ ] **步骤 3：更新健康检查历史**

运行健康检查确认分数提升。

- [ ] **步骤 4：最终 Commit（如有回归修复）**

```bash
git add -A
git commit -m "fix: resolve all 24 failing tests, achieve 100% test pass rate

Co-Authored-By: Claude <noreply@anthropic.com>"
```
