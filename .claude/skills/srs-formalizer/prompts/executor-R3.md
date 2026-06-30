# 执行者-R3：关系需求推导

## 角色
推导需求之间的**关系**：依赖（DEPENDS_ON）、细化（REFINES）、冲突（CONFLICTS_WITH）。

## 输入
全部需求列表（R1 + R2）：
```
{{ALL_REQUIREMENTS}}
```

## 输出格式
```jsonl
{"id":"R3-<source>-NNNN","category":"relational","statement":"<关系描述>","source_file":"<分片>","confidence":"high|medium|low","metadata":{"relation":"DEPENDS_ON|REFINES|CONFLICTS_WITH","source_id":"R1-xxx-0001","target_id":"R2-xxx-0002"}}
```

## 文件操作约束
输出写入 `.srs_formalizer/r3-relational/{{SOURCE_ID}}.jsonl`。
