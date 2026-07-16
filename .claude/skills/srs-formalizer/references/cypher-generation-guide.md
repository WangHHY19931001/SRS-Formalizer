# Cypher 生成指南

> **本文件是 Cypher 知识图谱生成的参考指南**，Agent 在 Backend B1 阶段读 IR 生成 Cypher 时依据此文档。详细规范见 `docs/DESIGN.md` §4.4 B1 与 §7.5。
>
> Cypher 知识图谱是**确定性产物**，无 draft/verified 生命周期，由 Agent 从 SRS-IR 直接生成并经 `validate-cypher` 门禁校验。

---

## 1. 生成流程（Backend B1）

| 步骤 | Agent 工作 | 产出 | 门禁/工具 |
|------|-----------|------|-----------|
| B1 | 读 IR → 生成 Cypher 知识图谱 | `outputs/graphs/srs-graph.cypher` | `validate-cypher --file` |

- **输入**：`srs-ir.json`（纯读方式消费 IR）
- **输出路径**：`outputs/graphs/srs-graph.cypher`
- **产物性质**：确定性产物，无 draft/verified 生命周期（区别于 BDD/TLA+/Lean）
- **门禁**：`validate-cypher --file <path> --workdir <path>`

---

## 2. IR 到 Cypher 的映射来源

Cypher 从 SRS-IR 的 `nodes[]` 与 `edges[]` 派生。完整 IR schema 见 `references/ir-schema-reference.md`（DESIGN.md §5）。

### 2.1 节点来源（IRNode）

```typescript
interface IRNode {
  id: string;
  type: IRNodeType;       // 'requirement' | 'nfr' | 'architecture' | ...
  module: string;
  labels: string[];
  properties: IRProperties;
  source: IRSource;
  analysis?: IRAnalysis;
}
```

每个 `IRNode` 对应 Cypher 中的一个节点。`IRNodeType` 枚举值为节点类型来源：

| IRNodeType | 说明 |
|------------|------|
| `requirement` | 显式/隐式/关系型需求 |
| `nfr` | 非功能性需求 |
| `architecture` | 架构节点（archType: Module/Actor/Constraint/Component/Interface） |
| `bdd_scenario` | BDD 场景 |
| `tla_action` | TLA+ Action |
| `tla_invariant` | TLA+ 不变式 |
| `lean_theorem` | Lean 4 定理 |
| `lean_lemma` | Lean 4 引理 |

### 2.2 边来源（IREdge）

```typescript
interface IREdge {
  id: string;  source: string;  target: string;
  type: IREdgeType;
  properties: IREdgeProperties;
}
```

每个 `IREdge` 对应 Cypher 中的一条关系。`IREdgeType` 枚举值为关系类型来源：

`depends_on`、`refines`、`conflicts_with`、`derived_from`、`same_aspect`、`contains`、`nfr_impacts`、`nfr_constrains`、`cross_file_depends`、`verifies`、`implements`、`proves`、`traces_to`。

> **注意**：DESIGN.md §4.4/§7.5 未规定具体的 label 命名（如 `:Requirement` vs `:requirement`）与边 type 大小写规则。Agent 生成时需保持 IR 类型值到 Cypher label/type 的**一致映射**，并由 `validate-cypher` 门禁校验语法正确性。

---

## 3. 注入防护（validate-cypher 4 项之一）

`validate-cypher`（DESIGN.md §7.5）执行 4 项检查，其中包含 **Cypher 语法检查**与**注入防护**。

### 3.1 参数化查询

生成 Cypher 时必须使用**参数化**方式，禁止将用户输入或 IR 中的字符串值直接拼接进 Cypher 语句。

正确做法（参数化）：
```cypher
MERGE (n:Requirement {id: $id})
SET n.statement = $statement,
    n.category = $category
```

错误做法（字符串拼接，会被门禁拒绝）：
```cypher
// 禁止：直接拼接 IR 中的 statement 值
MERGE (n:Requirement {id: "R1-..." , statement: "<直接拼接的字符串>"})
```

### 3.2 毒值拒绝

IR 中可能含有的 `undefined`/`null`/`NaN`/`[object Object]` 等毒值在 CLI 入口由 `validateNoPoisonArgs` 拦截（DESIGN.md §11.2）。Agent 生成 Cypher 时同样不得将这些毒值写入语句。

---

## 4. 幂等性要求

Cypher 知识图谱为确定性产物，重复生成应得到一致结果。Agent 生成时应确保：

- 按 `IRNode.id` 幂等创建节点（避免重复节点）
- 按 `IREdge.id` 幂等创建关系（避免重复边）
- `validate-cypher` 门禁校验语法与注入防护通过后方可视为生成成功

---

## 5. 产物路径与确定性

| 属性 | 值 |
|------|-----|
| 输出目录 | `outputs/graphs/` |
| 主产物 | `srs-graph.cypher` |
| 生命周期 | 确定性产物（无 draft/verified 状态机） |
| 消费方 | 追溯矩阵（B6）、审计包（B7） |

`outputs/graphs/` 与 BDD/TLA+/Lean 的 `draft`/`verified` 目录物理隔离，Cypher 产物不经历提升流程，由 `validate-cypher` 一次性校验。

---

## 6. 相关门禁

### validate-cypher（DESIGN.md §7.5）

| 命令 | 校验对象 | 检查项 | 关键参数 |
|------|----------|--------|----------|
| `validate-cypher` | `.cypher` | 4 项：Cypher 语法检查、注入防护 | `--file <path> --workdir <path>` |

校验失败返回 `{ status: "error" }` 并以非零状态退出（DESIGN.md §7.1 通用规则）。
