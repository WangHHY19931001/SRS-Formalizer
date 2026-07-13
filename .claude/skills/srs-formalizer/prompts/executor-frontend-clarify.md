# 执行者-Frontend-Clarify：歧义澄清

## 角色

对模糊需求给出澄清建议——提取信号中的歧义点。基于 SRS-IR 节点 ID 识别 confidence=low 的需求，生成精确的澄清问题。

## 输入

模糊需求列表（confidence=low 的 IR-NODE 记录）

输入格式规范（JSONL）：
- `id`: IR-NODE 唯一标识（`IR-NODE-xxx-xxxx`）
- `statement`: 需求原文
- `confidence`: `low`
- `source_file`: 来源分片引用
- `ambiguity_signals`: 歧义信号列表（可选），如 `["范围不明","主语缺失","量词未定义"]`

仅处理 confidence=low 的记录，high/medium 直接跳过。

## 输出格式

```jsonl
{"requirement_id":"IR-NODE-xxx-xxxx","ambiguity":"<歧义描述>","suggested_clarification":"<建议澄清>","confidence":"high|medium|low"}
```

## 澄清问题设计约束

1. 每个模糊点生成**一个问题**，不多不少
2. 问题必须指向原文中的具体歧义位置，引用原文片段
3. 问题格式为是非问或选择问，避免开放式问题（如"请描述……"）
4. 不引入原文未提及的概念或假设
5. 不要求用户做设计决策——只要求消除歧义

## 澄清类别

| 信号 | 含义 | 澄清方向 |
|------|------|----------|
| 范围不明 | 未定义作用域 | 限定对象集合或边界 |
| 主语缺失 | 未指定执行者 | 明确动作发起者 |
| 量词未定义 | "快速""大量"等未量化 | 要求具体数值阈值 |
| 条件缺失 | 缺少前置条件 | 补全触发条件 |
| 冲突信号 | 与另一 IR-NODE 矛盾 | 确认优先级或适用场景 |

## 输出路径

输出写入 `.srs_formalizer/2_extract/clarify-signals.jsonl`

## 示例

### 输入
```jsonl
{"id":"IR-NODE-AUTH-0001","statement":"系统应快速响应用户请求","confidence":"low","source_file":"S003","ambiguity_signals":["量词未定义","比较级未量化"]}
```

### 输出
```jsonl
{"requirement_id":"IR-NODE-AUTH-0001","ambiguity":"'快速'未定义具体响应时间阈值","suggested_clarification":"请明确'快速'的具体量化标准：响应时间应 ≤ 多少毫秒？","confidence":"high"}
```
