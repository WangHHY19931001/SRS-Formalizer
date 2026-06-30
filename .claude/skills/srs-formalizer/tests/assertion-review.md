# 断言强度审查清单 — S1 阶段

## 审查规则

对每个测试的每个断言，逐条回答 4 个问题：

| # | 问题 | 通过标准 |
|---|------|---------|
| Q1 | 断言方向是否正确？ | equal(actual, expected) 而非 equal(expected, actual) |
| Q2 | 预期值是否可从 SRS 唯一推导？ | 预期值在 SRS 中有明确规格描述 |
| Q3 | 是否存在假阳性风险？ | 断言足够严格，错误实现无法碰巧通过 |
| Q4 | 是否存在假阴性风险？ | 断言不过于严格，正确实现不会误报 |

## 审查结论

| 统计 | 数量 |
|------|------|
| 总断言数 | 42 |
| 直接通过 | 32 |
| 需增强 | 10 |

### 待增强断言

| # | 测试 | 问题 | 增强方案 |
|---|------|------|---------|
| 1 | init.creates_dirs | status==='ok' 不验证目录真实存在 | 已通过 fs.existsSync 验证 |
| 2 | init.idempotent | 仅检查 status | 第二次执行后验证 STATE.md 未变化 |
| 3 | init.rejects | message 匹配不够精确 | 使用 /must be.*\.srs_formalizer/i 正则 |
| 4 | init.STATE_fields | "S1" 可能在其他上下文出现 | 检查表格格式 \| 当前阶段 \| S1 \| |
| 5 | manifest.shards | shards.length >= 2 可能含空白 | 验证每个分片 char_count > 0 |
| 6 | manifest.P0_gaps | 仅验证 >0 而非精确数量 | 验证 P0 数量 = 2（§7 有 2 条问题） |
| 7 | manifest.CONTEXT | "SKU" 可能在其他上下文出现 | 验证表格格式 \| SKU \| 库存量单位 \| |
