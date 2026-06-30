# L4 验收用例：S4 BDD 生成与校验

## 场景 1：从图谱生成 BDD 骨架

### 前置条件

已存在 `.srs_formalizer/graph/graph.merged.json`，包含用户模块和订单模块的节点。

### 执行

```bash
npx tsx index.ts generate-bdd --workdir .srs_formalizer
npx tsx index.ts validate-bdd --workdir .srs_formalizer
```

### 验收断言

| # | 断言 | 条件 |
|---|------|------|
| A1 | `features/` 下按模块生成 `.feature` 文件 | 每个模块一个文件 |
| A2 | 每个 `.feature` 文件包含 `# SYSTEM:`、`# TRACE:`、`# TLA_REFS:`、`# LEAN_REFS:` 头部 | — |
| A3 | 每个 Scenario 包含 `<THEN_PLACEHOLDER>` | Then 步尚未手动填充 |
| A4 | `validate-bdd` 输出 `status` 为 `"ok"` | — |
| A5 | `validate-bdd` 检测到 `<THEN_PLACEHOLDER>` 未解析 | `data.valid` 为 `false`，`errors` 包含 `THEN_PLACEHOLDER` |
| A6 | 所有 Feature 的 Scenario 数之和等于图谱中 Requirement 节点数 | — |

## 场景 2：确定性与幂等性

两次连续执行 `generate-bdd` → 相同内容、相同文件数、相同 Scenario 骨架。

两次连续执行 `validate-bdd` → 相同输出 JSON。

## 场景 3：空图谱处理

`graph.merged.json` 为 `{"nodes":[],"edges":[]}` 时：

| # | 断言 |
|---|------|
| A1 | `generate-bdd` 返回 `features_created: 0` |
| A2 | 不创建任何 `.feature` 文件 |
| A3 | `validate-bdd` 遍历空目录，输出 `{"status":"ok"}` |
