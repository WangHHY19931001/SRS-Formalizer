# 校验者-Middle-End：中间端分析审核

## 调用时机
1. **何时调用**：当 Middle-end 各执行者完成结构/语义/NFR/连通性/冲突判决/风险分析后
2. **不调用**：structure/semantic/nfr/connectivity 任一未完成；M5 子代理判决未汇总；`srs-ir.json` 缺 `_analysis` 字段
3. **上下游**：上游 4 个 Middle-end executor（structure/semantic/nfr/risk）+ `check-connectivity` 产出 + M5 子代理判决 → 本文件 VERDICT → 下游 `verify-gate --stage R3`

## 角色

独立审核 Middle-end 分析产出的正确性与完整性。合并原 R4 验证（矛盾检测 + 歧义澄清审核）。**新会话执行，逐条全量验证，禁止抽样。**

## 输入

1. `executor-middle-end-structure` 产出：`3_graph/analysis/structure.json`
2. `executor-middle-end-semantic` 产出：`3_graph/analysis/semantic.json`（含 duplicates/conflicts/clusters 候选）
3. `executor-middle-end-nfr` 写回的 `srs-ir.json` `nfrProfile` 字段
4. `check-connectivity` 产出：`3_graph/analysis/connectivity.json`
5. M5 子代理判决结果：基于 `semantic.json` 候选逐对判决的 JSONL（CONTRADICTS / 同侧面 / 可合并），已由 Agent 合并入 IR `edges`
6. `executor-middle-end-risk` 写回的 `meta.riskScore` 与 `meta.highRiskShards`
7. 原始 IR-NODE + IR-EDGE（全量，用于交叉验证）

## Part A: NFR 标注正确性（Agent 经 executor-middle-end-nfr.md）

- [ ] **nfr_category 有效**：____/____ 条标注的 nfr_category ∈ {performance, security, availability, compatibility, maintainability, compliance}？
- [ ] **标注依据充分**：____/____ 条标注的 NFR 在 IR-NODE statement 中有明确关键词支撑？
- [ ] **无遗漏 NFR**：有明显 NFR 信号（"响应时间""并发用户""加密""审计"）但未标注的 IR-NODE？列出遗漏
- [ ] **无过度标注**：category 为 nfr 但实际为功能需求的记录？列出
- [ ] **NFR 传播完整性**：ARCH-SYS 节点是否正确继承了所含 IR-NODE 的 nfr_tags？

## Part B: check-connectivity 连通性报告

- [ ] **全节点覆盖**：是否所有 IR-NODE 都在连通性报告中有追踪？（无孤立节点）
- [ ] **连通分量数**：报告中共 ____ 个连通分量？非连通分量必须证明为真正的独立子系统（无 IR-EDGE 关联）？
- [ ] **最大连通分量大小**：是否超过预期阈值？大到必须拆分时已标注？
- [ ] **跨分片桥接**：cross_shard 边是否被正确识别并计入连通分量？
- [ ] **悬挂引用**：source_id/target_id 引用不存在的 IR-NODE？列出
- [ ] **孤立模块**：是否有 ARCH-SYS module 不含任何可达 IR-NODE？列出

## Part C: M5 冲突判决审核

基于 `semantic.json` 的 duplicates/conflicts/clusters 候选与 M5 子代理判决结果（已合并入 IR `edges`）：

### 判决合理性（逐对）

- [ ] **判决覆盖完整**：`semantic.json.conflicts[]` 中每个候选对都有对应 M5 判决（CONTRADICTS / 同侧面 / 可合并）？列出未判决的候选对
- [ ] **CONTRADICTS 判定可逆推**：每个标为 CONTRADICTS 的边，能否构造出一个矛盾场景（A 要求 X，B 要求 NOT X）？列出无法构造矛盾场景的边
- [ ] **同侧面判定合理**：每个标为 `same_aspect` 的边，两端节点是否同模块且同 NFR 类别（如 `module=Auth,nfrCategory=security`）？列出不符合的边
- [ ] **可合并判定语义等价**：每个标为可合并的候选对（confidence 均 ≥0.8 且 statement 语义一致），是否真为语义等价而非仅表面措辞相似？列出假阳性
- [ ] **跨模块矛盾覆盖**：`connectivity.json` 标注的跨模块潜在矛盾是否都已被 M5 判决？列出遗漏
- [ ] **判决 reasoning 充分**：每条判决的 reasoning ≥30 字符且引用原文关键词？列出推理不足的判决
- [ ] **无遗漏冲突**：与 `semantic.json.conflicts[]` 交叉检查，是否有未处理的 conflict 对？列出

### IR edges 写回审核

- [ ] **合并写入正确**：Agent 合并的 `same_aspect` 边是否符合「同模块且同 NFR 类别」约束？
- [ ] **冲突边标记**：confidence 差 ≥0.3 或 statement 语义矛盾的边是否已标记为 `conflicts_with`？
- [ ] **无重复边**：合并后的 `edges[]` 中是否存在重复（同 source + target + type）？
- [ ] **无悬挂边**：所有边的 source/target 都在 `nodes[]` 中？

### 低置信度节点审查（原「歧义澄清」职能并入此）

- [ ] **confidence=low 节点已标识**：所有 `confidence: low` 的 IR-NODE 是否在 `gaps[]` 或 `meta.highRiskShards` 中有对应风险记录？
- [ ] **无过度推导**：R2 implicit 节点的 `derived_from` 链是否合理（无 YAGNI 式无关推导）？
- [ ] **未引入概念**：R2 推导是否仅基于 R1 + 架构，未引入 SRS 原文未提及的概念？

## 输出格式

```
VERDICT: APPROVED | REJECTED
Passed: <N>/<M> checks
  Part A (NFR): X/Y
  Part B (connectivity): Z/W
  Part C (M5 conflict judgment): P/Q
    - 判决合理性: P1/Q1
    - IR edges 写回: P2/Q2
    - 低置信度节点: P3/Q3

Failed checks（附具体 id 和修正指令）:
- [Part C: 判决合理性] R3-S001-0012: 标为 CONTRADICTS 但无法构造矛盾场景（A 要求"必须加密"，B 要求"加密可选"——实为强度差异非矛盾）
- [Part C: IR edges 写回] same_aspect 边 R3-S002-0003: 两端节点分属 Auth 和 Payment 模块，不符合「同模块」约束
- [Part A] R1-SEC-0004: statement 含"加密存储"但未标注 nfr_category: security
```

## 拒绝条件

满足以下任意一条时判定 REJECTED：
1. NFR 标注遗漏 ≥2 个明显信号
2. 连通性报告缺失 conflict → 有跨模块矛盾的 CONFLICTS_WITH 边但未检测
3. 存在 CONTRADICTS 判定但无法构造矛盾场景
4. M5 子代理判决未覆盖 `semantic.json.conflicts[]` 全部候选对（遗漏 ≥1）
5. `same_aspect` 边两端节点不满足「同模块且同 NFR 类别」约束
6. R2 推导中有非原文引入的概念（YAGNI 式无关推导）
7. `confidence: low` 的 IR-NODE 未在 `gaps[]` 或 `meta.highRiskShards` 中标识（遗漏 ≥1）
