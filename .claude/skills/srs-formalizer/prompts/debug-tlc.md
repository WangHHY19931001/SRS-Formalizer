# TLC 反例分析

## 角色
分析 TLC 模型检查失败的反例轨迹，定位根因。

## 输入
TLC 错误输出（含反例轨迹/不变量违反/死锁信息）

## 分析步骤
1. 解析 TLC 错误类型：Invariant violated | Deadlock | State explosion | Syntax error
2. 若 Invariant violated：定位反例中的状态转换序列 → 判断是规约错误还是 SRS 设计缺陷
3. 若 Deadlock：定位导致死锁的状态 → 分析缺少的 Next 状态转换
4. 若 State explosion：建议拆解策略
5. 根因在 SRS 设计 → 输出至 SRS_PATCHES.md → 暂停，等待用户确认
6. 根因在规约 → 修正 .tla 文件 → 重新 tlc

## 输出
```markdown
## TLC Error Analysis
- Type: <Invariant/Deadlock/Explosion>
- Root Cause: <规约错误|SRS设计缺陷>
- Fix: <具体修正方案>
```

## 反例轨迹解读
TLC 输出的反例轨迹是一个状态序列：`s0 → s1 → s2 → ... → sn`，其中：
- `s0` 为初始状态
- `sn` 为违反不变量或死锁的状态
- 箭头 `→` 表示某 action 的触发

解读步骤：
1. 对比 sn 与不变量 Spec，找到第一个不满足不变量约束的状态
2. 从该状态逆向追溯，找到导致违规的 action 和前置条件
3. 判断该前置条件是否反映真实系统行为，或是规约建模过度简化

## 常见 TLC 错误模式及处理

| 错误类型 | 现象 | 典型根因 | 修复方向 |
|----------|------|----------|----------|
| Invariant violation | 反例轨迹中某状态不满足 Invariant | 规约的 Next 缺少前置条件 | 在 action 的 guard 中添加条件 |
| Deadlock | 某状态下所有 action 的 guard 均为 false | 状态转移覆盖不全 | 添加新 action 或扩展 guard |
| Stuttering violation | TLC 报告 "Stuttering" 违规 | Spec 中未允许 stuttering step | 添加 `[][Next]_vars` 到 Spec |
| State explosion | TLC 超出内存或状态上限 | 状态空间过大 | 加入 symmetry set、减少变量、使用模型缩减 |
| Undefined behavior | TLC 报 "Undefined" 或 "Null" | TLA+ 表达式访问了未定义值 | 检查 `EXCEPT` 或 `CHOOSE` 使用，添加防御判断 |

## 示例

### 输入（反例概要）
```
Invariant Violation: InvCandidateTyped is false.
State trace:
s0: pc = "idle", candidate = {}
s1: pc = "nominating", candidate = {x, y}
s2: pc = "idle", candidate = {x, y}
```

### 输出
```markdown
## TLC Error Analysis
- Type: Invariant
- Root Cause: SRS设计缺陷 — 提名阶段结束后候选人集合未清空，违反"每轮选举后候选人重置"约束
- Fix: 在 TLA+ 的 CloseNomination action 中添加 candidate' = {} 赋值
```
