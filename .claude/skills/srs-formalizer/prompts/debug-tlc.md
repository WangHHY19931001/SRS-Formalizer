# TLC 反例分析

## 调用时机
1. **何时调用**：当 TLC 模型检测报死锁/违法不变式/状态爆炸时
2. **不调用**：SANY 语法校验未通过（先修语法）；TLA+ 草稿尚未生成；TLC 反例为空
3. **上下游**：上游 `validate-tla` 的 TLC 反例轨迹 → 本文件 Root Cause + Fix → 下游 executor-tlaplus 修正

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

## 6 类 NFR 不变式违反诊断矩阵

当 TLC 报告不变量违反时，根据不变量名称快速定位根因和修复方向：

| 不变式 | TLC 错误特征 | 典型根因 | 修复方向 |
|--------|-------------|----------|----------|
| `PerfLatencyInv` | 反例中某 action 触发了不满足延迟约束的状态转换 | action 缺少时间/延迟前置条件，或多 action 的时序逻辑矛盾 | 在 action guard 中添加延迟约束，或增加超时 action 处理边界 |
| `SecurityInv` | 未授权主体访问了受保护状态（反例中 pc 变量出现未预期的权限提升） | 授权检查 missing（action guard 缺少主体身份/权限前置条件） | 在 action guard 中添加认证/授权前置条件，增加独立的 Auth action |
| `AvailInv` | 关键路径上某状态无合法 action 可达（反例终止于死锁） | 高可用路径的 Next 转换覆盖不全，或故障恢复 action 缺失 | 添加恢复 action、冗余路径 action，确保关键状态从任意前置状态可达 |
| `CompatInv` | 接口版本或数据类型在状态转换中不一致（反例中出现版本号跳跃或类型不匹配） | 接口升级/降级逻辑缺失，或版本迁移 action 缺少中间态 | 添加版本迁移 action 序列（逐级升级/降级），禁止跨版本跳变 |
| `MaintInv` | 运维操作（配置变更、滚动升级）导致的不一致状态（反例中运维 action 后系统进入未定义状态） | 运维 action 缺少 "操作窗口" 前置条件（如所有实例已就绪、流量已排空） | 在运维 action guard 中添加上下文前置条件，添加预检查 action |
| `ComplianceInv` | 审计日志或数据驻留状态在反例中不完整（关键 action 触发后 audit_log 未更新） | 合规敏感 action 缺少审计日志附加行为（副作用缺失） | 在每个合规敏感 action 中添加 audit_log' = Append(...) 语句，或独立 Audit action |

**诊断流程**：
1. 读取 TLC 反例中的不变量名称 → 对照上表确定 NFR 类别
2. 检查反例状态的变量快照 → 判定是 guard 缺失还是状态赋值错误
3. guard 问题 → 修改对应 action 的 guard 子句
4. 状态赋值问题 → 修改 action 的 primed variable 赋值
5. 属于 SRS 设计缺陷 → 写入 SRS_PATCHES.md，暂停等确认

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
