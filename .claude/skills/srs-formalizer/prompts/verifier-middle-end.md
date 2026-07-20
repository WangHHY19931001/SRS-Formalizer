# 校验者-Middle-End：中间端分析审核

## 调用时机
1. **何时调用**：当 Middle-end 各执行者完成结构/语义/NFR/连通性/冲突/风险分析后
2. **不调用**：structure/semantic/nfr/connectivity/contradiction 任一未完成；连通性报告缺失
3. **上下游**：上游 4 个 Middle-end executor + `check-connectivity` 产出 → 本文件 VERDICT → 下游 `verify-gate --stage S3`

## 角色

独立审核 Middle-end 分析产出的正确性与完整性。合并原 R4 验证（矛盾检测 + 歧义澄清审核）。**新会话执行，逐条全量验证，禁止抽样。**

## 输入

1. executor-middle-end-structure 产出（结构分析报告）
2. executor-middle-end-semantic 产出（疑似冲突清单）
3. executor-middle-end-nfr 产出（NFR 标注结果）
4. `check-connectivity` 产出（连通性报告）
5. executor-middle-end-contradiction 输出的判定 JSONL
6. executor-frontend-clarify 输出的澄清 JSONL
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

## Part C: 矛盾检测审核

基于 executor-middle-end-contradiction 的判定输出：

- [ ] **所有 conflict 判定可逆推**：每个 conflict 判定能否构造出一个矛盾场景？
- [ ] **consistent 判定确认**：每个 consistent 判定是语义等价非仅表面措辞？
- [ ] **different 判定正确**：是否确实描述不同对象/模块？无假阴性（实际冲突但判 different）？
- [ ] **跨模块矛盾覆盖**：连通性报告中标注的跨模块潜在矛盾是否都已被 executor 判定？
- [ ] **推理充分**：每条 reasoning ≥30 字符且引用原文关键词？
- [ ] **无遗漏冲突**：与输入冲突清单交叉检查，是否有未处理的 conflict 对？

## Part D: 歧义澄清审核

基于 executor-frontend-clarify 的判定输出：

- [ ] **澄清问题格式**：是否所有问题为是非问/选择问（非开放式）？
- [ ] **歧义指向原文**：澄清是否引用 IR-NODE statement 中的具体原文片段？
- [ ] **无引入概念**：是否有引入原文未提及的概念？
- [ ] **覆盖完整**：所有 confidence=low 的 IR-NODE 是否都有对应澄清建议？
- [ ] **无重复覆盖**：同一模糊点是否被两个不同问题重复覆盖？
- [ ] **置信度正确**：澄清建议的 confidence 必须与 IR-NODE confidence 一致？

## 输出格式

```
VERDICT: APPROVED | REJECTED
Passed: <N>/<M> checks
  Part A (NFR): X/Y
  Part B (connectivity): Z/W
  Part C (contradiction): P/Q
  Part D (clarification): R/S

Failed checks（附具体 id 和修正指令）:
- [Part C] CONFLICT-003: 两条需求分别描述前后端响应时间，应判 different 而非 conflict
- [Part D] IR-NODE-DATA-0002: 澄清问题引入了原文未出现的'数据分片'概念
- [Part A] IR-NODE-SEC-0004: statement 含"加密存储"但未标注 nfr_category: security
```

## 拒绝条件

满足以下任意一条时判定 REJECTED：
1. NFR 标注遗漏 ≥2 个明显信号
2. 连通性报告缺失 conflict → 有跨模块矛盾的 CONFLICTS_WITH 边但未检测
3. 存在 conflict 判定但无法构造矛盾场景
4. 澄清建议中有非原文引入的概念
5. confidence=low 的 IR-NODE 未全部覆盖（遗漏 ≥1）
