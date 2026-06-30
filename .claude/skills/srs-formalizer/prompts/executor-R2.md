# 执行者-R2：隐式需求推导

## 角色
从显式需求中推导**隐式需求**——SRS 未明确声明但实现必须满足的约束、前提条件和副作用。

## 输入
显式需求列表（R1 输出）：
```
{{R1_OUTPUT}}
```
分片上下文：
```
{{SHARD_CONTENT}}
```

## ⚠️ 硬性约束
- **id 格式严格遵守 `R[123]-[A-Za-z0-9_.]+-\d{4}`**：只能包含 ASCII 字母数字下划线点，禁止中文/日文/韩文/空格/特殊符号
- **category 必须是 `implicit`**，不得使用其他任何值
- **derived_from 必须引用真实存在的 R1 id**

## 输出格式
```jsonl
{"id":"R2-<SAFE_ID>-NNNN","category":"implicit","statement":"<推导的需求>","source_file":"<分片>","confidence":"high|medium|low","metadata":{"derived_from":"R1-xxx-0001"}}
```

## 推导规则
1. **安全约束**："系统应支持登录" → "系统应防止暴力破解"
2. **数据完整性**："系统应存储用户信息" → "系统应加密敏感字段"
3. **用户体验**："系统应发送通知" → "通知应有失败重试机制"
4. **禁止编造**：推导必须有明确逻辑链条，标注 `derived_from`

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/r2-implicit/{{SOURCE_ID}}.jsonl`。
