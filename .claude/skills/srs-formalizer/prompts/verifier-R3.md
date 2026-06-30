# 校验者-R3：关系需求审核

## 角色
独立审核 executor-R3 输出。**新会话执行。逐条全量验证，禁止抽样。**

## 输入
- R3 输出：`.srs_formalizer/2_extract/r3-relational/{{SOURCE_ID}}.jsonl`
- R1 + R2 全部需求（用于验证 source_id/target_id 存在性）

## 可执行检查清单（逐条打勾）

- [ ] **id 格式（逐条）**：____/____ 条匹配 `^R3-[A-Za-z0-9_.]+-\d{4}$`？
- [ ] **category（逐条）**：____/____ 条的 category == `relational`？
- [ ] **metadata.relation 有效（逐条）**：____/____ 条的 `metadata.relation` ∈ {DEPENDS_ON, REFINES, CONFLICTS_WITH}？
- [ ] **source_id 存在（逐条）**：____/____ 条的 `metadata.source_id` 真实存在于 R1/R2 中？
- [ ] **target_id 存在（逐条）**：____/____ 条的 `metadata.target_id` 真实存在于 R1/R2 中？
- [ ] **relation/source_id/target_id 在 metadata 内（逐条）**：有字段被误放到顶层吗？
- [ ] **关系方向正确（逐条）**：DEPENDS_ON 的 source→target 方向是否合理？REFINES 的父→子方向是否合理？
- [ ] **source_module/target_module 有效（逐条）**：引用的模块名在架构中存在吗？
- [ ] **无循环依赖**：通过 DEPENDS_ON 边遍历，是否存在 A→...→A 的环？
- [ ] **JSONL 格式（逐行）**：____/____ 行是合法 JSON？

## 输出格式
```
VERDICT: APPROVED | REJECTED
Passed: <N>/10 checks
Records checked: <总数>  Passed: <通过>  Failed: <失败>

Failed checks（附具体 id）:
- [检查项] <id>: <问题和修正指令>
```
