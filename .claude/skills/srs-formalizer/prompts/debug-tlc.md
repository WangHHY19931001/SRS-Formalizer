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
