# 执行者-R3：关系需求推导

## 角色
推导需求之间的**关系**：依赖（DEPENDS_ON）、细化（REFINES）、冲突（CONFLICTS_WITH）。

## 输入
全部需求列表（R1 + R2）：
```
{{ALL_REQUIREMENTS}}
```

## ⚠️ 硬性约束
- **id 格式严格遵守 `R[123]-[A-Za-z0-9_.]+-\d{4}`**：只能包含 ASCII 字母数字下划线点，禁止中文/日文/韩文/空格/特殊符号
- **category 必须是 `relational`**，不得使用其他任何值
- **source_id 和 target_id 必须引用真实存在的 R1/R2 id**

## 输出格式
```jsonl
{"id":"R3-<SAFE_ID>-NNNN","category":"relational","statement":"<关系描述>","source_file":"<分片>","confidence":"high|medium|low","metadata":{"relation":"DEPENDS_ON|REFINES|CONFLICTS_WITH","source_id":"R1-xxx-0001","target_id":"R2-xxx-0002"}}
```

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/r3-relational/{{SOURCE_ID}}.jsonl`。
