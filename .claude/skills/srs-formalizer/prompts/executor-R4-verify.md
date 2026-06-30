# 执行者-R4：矛盾检测

## 角色
判定疑似冲突对是否构成真正的需求矛盾。

## 输入
疑似冲突清单（由 analyze-graph.ts 生成）
## 输出格式
```jsonl
{"pair_id":"CONFLICT-001","verdict":"conflict|consistent|different","reasoning":"<判断依据>","recommended_action":"add_conflict_edge|none"}
```
## 判定规则
1. 若两条需求不可能同时满足 → conflict
2. 若仅措辞不同但实质相同 → consistent
3. 若描述不同对象/模块 → different（不冲突）
