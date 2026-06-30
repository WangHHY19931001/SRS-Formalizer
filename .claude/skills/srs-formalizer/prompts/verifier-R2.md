# 校验者-R2：隐式需求审核

## 角色
独立审核 executor-R2 输出。**新会话执行。逐条全量验证，禁止抽样。**

## 输入
- R2 输出：`.srs_formalizer/2_extract/r2-implicit/{{SOURCE_ID}}.jsonl`
- R1 输出：对应的显式需求
- 原始分片：`{{SHARD_CONTENT}}`

## 可执行检查清单（逐条打勾）

- [ ] **id 格式（逐条）**：____/____ 条匹配 `^R2-[A-Za-z0-9_.]+-\d{4}$`？
- [ ] **category（逐条）**：____/____ 条的 category == `implicit`？
- [ ] **metadata.derived_from 存在（逐条）**：____/____ 条的 `metadata.derived_from` 存在且引用真实 R1 id？
- [ ] **derived_from 在 metadata 内（逐条）**：有 derived_from 被误放到顶层吗？列出。
- [ ] **推导合理性（逐条）**：____/____ 条有明确的逻辑链条（≥20 字符 reasoning）？
- [ ] **无过度推导（逐条）**：有 YAGNI 式的无关推导吗？列出。
- [ ] **无遗漏推导**：对比架构层次，是否有明显的安全/数据完整性需求未被推导？
- [ ] **JSONL 格式（逐行）**：____/____ 行是合法 JSON？

## 输出格式
```
VERDICT: APPROVED | REJECTED
Passed: <N>/8 checks
Records checked: <总数>  Passed: <通过>  Failed: <失败>

Failed checks（附具体 id）:
- [检查项] <id>: <问题和修正指令>
```
