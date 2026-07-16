# 执行者-Middle-End-Contradiction：矛盾检测

## 角色

基于 Middle-end 的 `check-connectivity` 和 `analyze-graph` 产出，判定疑似冲突对是否构成真正的需求矛盾。严格基于需求原文做判定，不引入外部知识或假设。

## 输入

疑似冲突清单（由 `analyze-graph` 生成，JSONL 格式）：

- `pair_id`: 冲突对唯一标识（CONFLICT-xxx）
- `requirement_a_id`: IR-NODE id（A）
- `requirement_a_text`: A 的原文
- `requirement_b_id`: IR-NODE id（B）
- `requirement_b_text`: B 的原文
- `conflict_type`: 疑似冲突类型（`resource` / `logic` / `temporal` / `scope`）
- `detected_by`: 检测来源（`analyze-graph` / `connectivity-check` / `cross-module`）

## 输出格式

```jsonl
{"pair_id":"CONFLICT-xxx","verdict":"conflict|consistent|different","reasoning":"<判断依据>","recommended_action":"add_conflict_edge|none","related_modules":["<MOD_A>","<MOD_B>"]}
```

## 判定规则

| 条件 | 判定 |
|------|------|
| 两条需求不可能同时满足 | `conflict` |
| 仅措辞不同但实质相同 | `consistent` |
| 描述不同对象/模块 | `different`（不冲突） |

## 判定行为约束

1. 必须先读全两条需求的完整原文，再下结论
2. `conflict` 判定必须能构造出一个可复现的矛盾场景
3. `consistent` 判定需说明为何措辞差异不构成矛盾
4. 不能仅因两条需求"看起来相似"就判 consistent——需确认语义等价
5. `reasoning` 字段必须 ≥30 字符，引用原文关键词

## 跨模块矛盾检测

利用 `check-connectivity` 的连通性报告，检测跨文件/跨模块矛盾：

- 不同模块中相同概念的不同定义 → 标记 `scope` 类型冲突
- 跨模块循环依赖 → 标记 `logic` 类型冲突
- 同一 NFR 在不同模块中阈值矛盾 → 标记 `resource` 类型冲突
- 父子模块间职责重叠或遗漏 → 标记 `scope` 类型冲突

## 输出路径

输出写入 `.srs_formalizer/3_analyze/contradiction-report.jsonl`

## 示例

### 输入
```jsonl
{"pair_id":"CONFLICT-001","requirement_a_id":"IR-NODE-PERF-0001","requirement_a_text":"系统响应时间应 ≤ 200ms","requirement_b_id":"IR-NODE-PERF-0002","requirement_b_text":"系统响应时间应 ≥ 500ms","conflict_type":"logic","detected_by":"analyze-graph"}
```

### 输出
```jsonl
{"pair_id":"CONFLICT-001","verdict":"conflict","reasoning":"IR-NODE-PERF-0001要求≤200ms，IR-NODE-PERF-0002要求≥500ms，两个阈值无重叠区间，无法同时满足","recommended_action":"add_conflict_edge","related_modules":["PerformanceModule"]}
```
