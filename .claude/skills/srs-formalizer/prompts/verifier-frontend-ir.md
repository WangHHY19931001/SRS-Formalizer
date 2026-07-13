# 校验者-Frontend-IR：IR 完整性审核

## 角色

独立审核 executor-frontend-extract 输出的 SRS-IR 节点和边。合并原 R1（显式）、R2（隐式）、R3（关系）验证。**新会话执行，逐条全量验证，禁止抽样。**

## 输入

- IR-NODE 输出：`.srs_formalizer/2_extract/r1-explicit/` + `r2-implicit/` + `nfr-signals/` 下的所有 JSONL
- IR-EDGE 输出：`.srs_formalizer/2_extract/r3-relational/` + `cross-shard.jsonl`
- 原始分片：`{{SHARD_CONTENT}}`

## Part A: IR-NODE 校验

### 字段完整性（逐条）

- [ ] **id 格式**：____/____ 条匹配 `^IR-NODE-[A-Za-z0-9_.]+-\d{4}$`？列出不匹配的 id
- [ ] **category 枚举**：____/____ 条的 category ∈ {explicit, implicit, nfr}？列出非法值
- [ ] **statement 可追溯**：____/____ 条的 statement 在分片原文中能找到对应段落？列出无法追溯的记录
- [ ] **无编造**：____/____ 条可在分片中找到原文依据？列出 SRS 中不存在的内容
- [ ] **metadata 存在**：____/____ 条含 metadata 字段？
- [ ] **metadata 内容正确**：
  - explicit: metadata == {}（空对象）
  - implicit: metadata.derived_from 存在且引用真实 IR-NODE id
  - nfr: metadata.nfr_category ∈ {performance, security, reliability, usability, maintainability, compliance}
- [ ] **confidence 有效**：____/____ 条的 confidence ∈ {high, medium, low}？

### 隐式需求专项（逐条 implicit 记录）

- [ ] **derived_from 在 metadata 内**：有 derived_from 被误放到顶层吗？
- [ ] **推导合理性**：____/____ 条有明确的逻辑链条（≥20 字符 reasoning）？
- [ ] **无过度推导**：有 YAGNI 式的无关推导吗？

### 覆盖完整性

- [ ] **无遗漏**：分片中每个功能需求都被提取了吗？（逐章节对照）
- [ ] **无重复 id**：所有 IR-NODE id 唯一吗？
- [ ] **跨分片一致性**：同一概念在不同分片中的 statement 是否一致？
- [ ] **空分片处理**：无需求的分片是否输出空文件（0 字节）？

## Part B: IR-EDGE 校验

### 字段完整性（逐条）

- [ ] **id 格式**：____/____ 条匹配 `^IR-EDGE-[A-Za-z0-9_.]+-\d{4}$`？
- [ ] **category 枚举**：____/____ 条的 category ∈ {relational, cross_shard}？
- [ ] **metadata.relation 有效**：____/____ 条的 `metadata.relation` ∈ {DEPENDS_ON, REFINES, CONFLICTS_WITH, SAMENESS_AS}？
- [ ] **source_id 存在**：____/____ 条的 `metadata.source_id` 真实存在于 IR-NODE 中？
- [ ] **target_id 存在**：____/____ 条的 `metadata.target_id` 真实存在于 IR-NODE 中？
- [ ] **字段在 metadata 内**：relation/source_id/target_id/source_module/target_module 有被误放到顶层吗？
- [ ] **source_module/target_module 有效**：引用的模块名在架构中存在吗？

### 关系合理性

- [ ] **关系方向正确**：DEPENDS_ON 的 source→target 方向合理？REFINES 的父→子方向合理？
- [ ] **无循环依赖**：通过 DEPENDS_ON 边遍历，是否存在 A→...→A 的环？
- [ ] **跨分片 SAMENESS_AS**：source/target 分属不同分片？statement 语义等价？

## 输出格式

```
VERDICT: APPROVED | REJECTED
Passed: <N>/<M> checks (Part A: X/Y, Part B: Z/W)
Records checked: <总数>
Records passed: <通过数>
Records failed: <失败数>

Failed checks（附具体 id 和修正指令）:
- [Part A: id格式] IR-NODE-S001-0003: id 含中文
- [Part B: source_id] IR-EDGE-S001-0005: source_id 引用不存在的 IR-NODE
```

## 约束

- **禁止抽样**：标注"逐条"的检查必须覆盖每一条记录
- REJECTED 时给具体修正指令（精确到记录 id）
- ≥3 次 REJECTED → BLOCKED
