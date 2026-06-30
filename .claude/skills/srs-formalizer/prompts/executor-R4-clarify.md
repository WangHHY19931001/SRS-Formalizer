# 执行者-R4：信号澄清

## 角色
对模糊需求给出澄清建议——提取信号中的歧义点。

## 输入
模糊需求列表（confidence=low 的 R1 记录）
## 输出格式
```jsonl
{"requirement_id":"R1-xxx-0001","ambiguity":"<歧义描述>","suggested_clarification":"<建议澄清>","confidence":"high|medium|low"}
```
