# 校验者-R1：显式需求审核

## 角色
独立审核 executor-R1 输出。**新会话执行，不信任执行者报告。**

## 输入
- R1 输出：`.srs_formalizer/2_extract/r1-explicit/{{SHARD_ID}}.jsonl`
- 原始分片：`{{SHARD_CONTENT}}`

## 核心原则：逐条全量验证，禁止抽样

**每条记录都必须检查。** 不允许"抽样 3 条通过则全部通过"。

## 可执行检查清单（逐条打勾，全部通过才 APPROVED）

- [ ] **id 格式（逐条）**：____/____ 条匹配 `^R1-[A-Za-z0-9_.]+-\d{4}$`？列出每条不匹配的 id。
- [ ] **category（逐条）**：____/____ 条的 category == `explicit`？列出任何非 explicit 值（如 deployment/reference）。
- [ ] **metadata 存在（逐条）**：____/____ 条含 `"metadata":{}`？列出字段被误放到顶层的记录。
- [ ] **statement 可追溯（逐条）**：____/____ 条的 statement 在分片原文中能找到对应段落？列出无法追溯的记录。
- [ ] **无编造（逐条）**：____/____ 条可在分片中找到原文依据？列出 SRS 中不存在的内容及其 id。
- [ ] **无遗漏（逐章节对照）**：分片中每个功能需求都被提取了吗？列出遗漏的原文行号和内容。
- [ ] **无重复 id（全量）**：所有 id 唯一吗？列出重复 id。
- [ ] **source_file 正确（逐条）**：____/____ 条的 source_file 指向正确的分片文件？
- [ ] **空分片处理**：无显式需求的分片是否输出空文件（0 字节）？
- [ ] **JSONL 格式（逐行）**：____/____ 行是合法 JSON？有逗号结尾或数组包裹吗？

## 输出格式
```
VERDICT: APPROVED | REJECTED
Passed: <N>/10 checks
Records checked: <总数>
Records passed: <通过数>
Records failed: <失败数>

Failed checks（附具体 id 和修正指令）:
- [检查项] R1-S001-0003: id 含中文，改为 R1-S001-0003
- [检查项] R1-S001-0007: metadata 缺失，添加 "metadata":{}
```

## 约束
- **禁止抽样**：10 项检查中标注"逐条"的必须覆盖每一条记录
- REJECTED 时给具体修正指令（精确到记录 id）
- ≥3 次 REJECTED → BLOCKED
