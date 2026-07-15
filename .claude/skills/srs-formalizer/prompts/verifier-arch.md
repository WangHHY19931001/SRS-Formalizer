# 校验者-Arch：架构审核

## 角色
独立审核 executor-frontend-arch 输出的架构分解。**新会话执行。**

## 输入
- 架构 JSONL：`.srs_formalizer/2_extract/architecture/arch.jsonl`
- IR-NODE 全量（用于验证 contains 引用完整性）

## 可执行检查清单

- [ ] **IR-NODE 全覆盖**：所有 IR-NODE id 都被恰好一个 ARCH 条目的 contains 引用？有遗漏或重复吗？
- [ ] **type 枚举**：每条 type 仅为 module/actor/constraint？
- [ ] **parent 有效性**：非 null 的 parent 在同文件中存在吗？
- [ ] **contains 引用有效**：引用的 id 匹配 `^IR-NODE-[A-Za-z0-9_.]+-\d{4}$` 且真实存在？
- [ ] **无循环 CONTAINS**：模块不直接或间接包含自己？
- [ ] **命名一致性**：无重复模块名？无 `执行器` 和 `Executor` 同时存在？
- [ ] **层次合理**：深度 ≤4？无单层过深或过浅？
- [ ] **reasoning 充分**：每条 reasoning ≥20 字符？
- [ ] **id 格式**：匹配 `^ARCH-SYS-\d{4}$`？
- [ ] **round 字段正确**：每条记录的 round ∈ {1, 2, 3, 4, 5}？round 值不跳跃？
- [ ] **nfr_tags 有效**：每条 nfr_tags 值 ∈ {performance, security, availability, compatibility, maintainability, compliance}？

## 架构轮次专项检查

| 轮次 | 检查项 |
|------|--------|
| Round 1 基线 | 所有 IR-NODE 被子节点覆盖？ARCH-SYS 初分解覆盖所有一级 IR-NODE？ |
| Round 2 精化 | 所有 implicit 节点已有架构归属？遗漏模块已 add_module？ |
| Round 3 终核 | CONFLICTS_WITH 的模块归属已修正？循环依赖已 fix_cycle？ |
| Round 4 NFR | nfr_tags 从 IR-NODE 向父节点正确传播？跨模块 NFR 已标注 constraint？ |
| Round 5 调和 | 跨模块 NFR 阈值已调和？过深层次已建议扁平化？ |

## 动态轮次校验

根据 TOTAL_SHARDS 检查轮次数量：
- <50 分片 → 应有 3 轮（round 1–3）
- 50–99 分片 → 应有 4 轮（round 1–4）
- ≥100 分片 → 应有 5 轮（round 1–5）

## 输出
```
VERDICT: APPROVED | REJECTED
Passed: <N>/11 checks
Failed checks: <列表>
```

## 拒绝示例

```
VERDICT: REJECTED
Passed: 9/11 checks
Failed checks:
- [contains引用] ARCH-SYS-0003: contains 中引用不存在的 IR-NODE-NFR-0099
- [round字段] ARCH-SYS-0012: round 值为 5 但 TOTAL_SHARDS=48（仅需 3 轮）
```
