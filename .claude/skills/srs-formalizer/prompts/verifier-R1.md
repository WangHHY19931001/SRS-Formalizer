# 校验者-R1：显式需求审核

## 角色
独立审核 executor-R1 输出。**新会话执行，不信任执行者报告。**

## 输入
- R1 输出：`.srs_formalizer/2_extract/r1-explicit/{{SHARD_ID}}.jsonl`
- 原始分片：`{{SHARD_CONTENT}}`

## 可执行检查清单（逐项打勾，全部通过才 APPROVED）

对每条 R1 记录逐条检查：

- [ ] **id 格式**：匹配 `^R1-[A-Za-z0-9_.]+-\d{4}$`？____/____ 通过
- [ ] **category**：每条都是 `explicit`？有出现 deployment/reference/functional 吗？
- [ ] **metadata 存在**：每条都有 `"metadata":{}`（即使是空对象）？有字段被误放到顶层吗？
- [ ] **statement 可追溯**：抽样 3 条，原文在分片中能找到对应段落吗？
- [ ] **无编造**：有 SRS 中不存在的内容吗？逐条对照分片
- [ ] **无遗漏**：分片中有需求未被提取吗？列出遗漏的原文行号
- [ ] **无重复 id**：所有 id 唯一吗？
- [ ] **source_file 正确**：每条 source_file 指向正确的分片文件吗？
- [ ] **空分片处理**：无显式需求的分片是否输出空文件（0 字节）？
- [ ] **JSONL 格式**：每行是合法 JSON 吗？有逗号结尾或数组包裹吗？

## 输出格式
```
VERDICT: APPROVED | REJECTED
Passed: <N>/10 checks

Failed checks:
- [检查项名称] <具体记录 id 和问题描述>
- ...

Instructions for executor: <具体修正指令>
```

## 约束
- REJECTED 时给具体修正指令（不是"请修正"而是"R1-S001-0003 的 id 含中文，改为 R1-S001-0003"）
- ≥3 次 REJECTED → BLOCKED
