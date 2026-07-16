# 风险评分公式

> **本文件是风险评分公式的参考文档**，Agent 在 Middle-end M6 阶段读 IR 按公式计算风险评分、写回 `meta.riskScore` 时依据此文档。详细规范见 `docs/DESIGN.md` §4.3。
>
> 风险评分由 Agent 计算（非脚本），结果写入 SRS-IR 的 `meta.riskScore` 与 `meta.highRiskShards`。

---

## 1. 公式（DESIGN.md §4.3）

```
riskScore = orphanRate × 0.2 + crossFileCoverage × 0.3 + nfrCoverage × 0.3 + gapWeight × 0.2
```

权重分配：

| 分量 | 权重 |
|------|:----:|
| `orphanRate` | 0.2 |
| `crossFileCoverage` | 0.3 |
| `nfrCoverage` | 0.3 |
| `gapWeight` | 0.2 |
| **合计** | **1.0** |

由于权重合计为 1.0，当各分量取值范围为 [0, 1] 时，`riskScore` 的范围亦为 **[0, 1]**。

---

## 2. 分量定义与 IR 来源

### 2.1 orphanRate（孤儿率）

```
orphanRate = 孤儿节点数 / 总节点数
```

**IR 来源**：
- 孤儿节点：M1 阶段 Agent 判断的孤儿节点（`IRNode.analysis.structure.orphan === true`）
- 总节点数：`IRMeta.totalNodes`

DESIGN.md §4.3 M1 步骤：Agent 读 IR 判断孤儿节点、悬挂边、概念孤岛、跨文件孤岛。

### 2.2 crossFileCoverage（跨文件覆盖率）

```
crossFileCoverage = 跨文件引用边数 / 总边数
```

**IR 来源**：
- 跨文件引用边：`IREdge.type === 'cross_file_depends'` 的边数
- 总边数：`IRMeta.totalEdges`

DESIGN.md §5.3 定义 `cross_file_depends` 为跨文件依赖边类型。

### 2.3 nfrCoverage（NFR 覆盖率）

```
nfrCoverage = 已覆盖 NFR 类别数 / 6
```

**IR 来源**：
- 已覆盖 NFR 类别数：`NFRProfile.detectedCategories` 中出现的类别数
- 总类别数：6（DESIGN.md §4.3 六类正式分类）

等价计算：`nfrCoverage = (6 - NFRProfile.blindSpots.length) / 6`

DESIGN.md §4.3 规定全系统唯一六类 NFR：`performance`、`security`、`availability`、`compatibility`、`maintainability`、`compliance`。`NFRProfile.blindSpots` 记录未覆盖到的类别。

### 2.4 gapWeight（缺口权重）

```
gapWeight = gap 数量加权后归一化
```

**IR 来源**：
- gap 列表：`SRSIR.gaps`（类型 `IRGap[]`）
- gap 优先级：`IRGap.priority`，枚举为 `'P0' | 'P1' | 'P2' | 'P3'`（DESIGN.md §5.4）

```typescript
interface IRGap {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference'
      | 'incomplete_section' | 'cross_chapter_gap';
  description: string;  sourceChapter: string;
}
```

> **注意**：DESIGN.md §4.3 未规定 `IRGap.priority`（P0-P3）到具体加权数值的映射。Agent 计算时应按优先级递减赋权（P0 最高、P3 最低），求和后归一化到 [0, 1] 范围。具体加权系数由 Agent 根据 SRS 上下文确定，不在 DESIGN.md 中硬编码。

---

## 3. 写回字段（DESIGN.md §5.4）

风险评分写回 `IRMeta`：

```typescript
interface IRMeta {
  sourcePath: string;  sourceHash: string;  language: 'zh' | 'en';
  totalChars: number;  totalShards: number;
  totalNodes: number;  totalEdges: number;
  buildTimestamp: string;
  riskScore?: number;       // M6 写回
  highRiskShards?: string[]; // M6 写回
}
```

---

## 4. Middle-end M6 阶段

| 步骤 | Agent 工作 | 产出 | 门禁/工具 |
|------|-----------|------|-----------|
| M6 | 读 IR → 按风险公式计算风险评分 → 写回 `meta.riskScore` | `srs-ir.json`（mutate meta） | — |

M6 阶段无独立门禁校验，风险评分作为后续阶段（如 NFR 条件触发、跨图验证）的输入信号。

---

## 5. highRiskShards

`IRMeta.highRiskShards` 记录高风险分片 ID 列表。

> **注意**：DESIGN.md §4.3 未规定 `highRiskShards` 的具体判定阈值。Agent 应根据 `riskScore` 与 `orphanRate` 等分量综合判定哪些分片属于高风险，写入 `highRiskShards` 数组。具体阈值不在 DESIGN.md 中硬编码。

---

## 6. 消费方

风险评分作为以下决策的输入信号：

| 消费方 | 用途 |
|--------|------|
| NFR 条件触发（§4.3） | highRiskShards 影响 TLA+/Lean 4 产物生成决策 |
| 跨图一致性验证（§4.5） | 收敛循环中作为风险评估输入 |
| 追溯矩阵（B6） | 风险标注 |
| 审计包（B7） | 风险记录 |
