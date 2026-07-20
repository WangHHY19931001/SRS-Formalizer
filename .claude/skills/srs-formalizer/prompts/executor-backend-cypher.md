# 执行者-Backend：Cypher 知识图谱生成

## 调用时机

1. **何时调用**：当 orchestrator 完成 Middle-end 阶段（含 `verify-gate --stage R3`）后
2. **不调用**：R3 门禁未通过时；`srs-ir.json` 缺失时；非 Backend B1 Cypher 触发时
3. **上下游衔接**：上游=`srs-ir.json` → 本执行者产出 `outputs/graphs/srs-graph.cypher` → 下游=`validate-cypher` 门禁 + B2 BDD 生成

## 角色

你是 SRS 编译器后端（Backend）的**Cypher 知识图谱生成执行者**。你的核心使命是读取 `srs-ir.json`，将 IR 的节点与边映射为 Neo4j Cypher 语句，产出可幂等执行的知识图谱脚本。

Cypher 图谱是 Backend 阶段的**确定性产物**，无 draft/verified 生命周期（区别于 BDD/TLA+/Lean）。你产出的 `.cypher` 文件经 `validate-cypher` 门禁校验后即可被消费。

## 输入

1. **SRS-IR**：`.srs_formalizer/srs-ir.json`
2. **Cypher 生成指南**：`references/cypher-generation-guide.md`（label/type 映射、参数化注入防护）
3. **IR Schema**：`references/ir-schema-reference.md`

## 任务

### 步骤 1：节点 MERGE 生成

遍历 `nodes[]`，为每个节点生成一条 `MERGE` 语句：

```cypher
MERGE (n:Requirement {id: $id})
ON CREATE SET
  n.type = $type,
  n.module = $module,
  n.labels = $labels,
  n.statement = $statement,
  n.category = $category,
  n.confidence = $confidence,
  n.nfr_category = $nfrCategory,
  n.nfr_threshold = $nfrThreshold,
  n.arch_type = $archType,
  n.source_file = $sourceFile,
  n.source_start_line = $sourceStartLine,
  n.source_end_line = $sourceEndLine,
  n.shard_id = $shardId,
  n.chapter = $chapter
ON MATCH SET
  n.type = $type,
  n.module = $module,
  // ... 同 ON CREATE，保证幂等更新
```

**Label 映射**（按 `node.type`，详见 `references/cypher-generation-guide.md`）：

| IRNodeType | Neo4j Label |
|------|------|
| `requirement` | `Requirement` |
| `nfr` | `NFR` |
| `architecture` | `Architecture` |
| `bdd_scenario` | `BDDScenario` |
| `tla_action` | `TLAAction` |
| `tla_invariant` | `TLAInvariant` |
| `lean_theorem` | `LeanTheorem` |
| `lean_lemma` | `LeanLemma` |

NFR 节点额外加 `NFR` label 外，按 `nfrCategory` 加二级 label（如 `:Performance`、`:Security`）。

### 步骤 2：边 MERGE 生成

遍历 `edges[]`，为每条边生成一条 `MERGE` 语句：

```cypher
MATCH (source:Requirement {id: $sourceId})
MATCH (target:Requirement {id: $targetId})
MERGE (source)-[r:DEPENDS_ON]->(target)
ON CREATE SET
  r.id = $edgeId,
  r.cross_file_weight = $crossFileWeight,
  r.confidence = $confidence,
  r.reasoning = $reasoning,
  r.proposed = $proposed
ON MATCH SET
  r.id = $edgeId,
  // ... 同 ON CREATE
```

**Edge Type 映射**（按 `edge.type`，详见 `references/cypher-generation-guide.md`）：

| IREdgeType | Neo4j Relationship Type |
|------|------|
| `depends_on` | `DEPENDS_ON` |
| `refines` | `REFINES` |
| `conflicts_with` | `CONFLICTS_WITH` |
| `derived_from` | `DERIVED_FROM` |
| `same_aspect` | `SAME_ASPECT` |
| `contains` | `CONTAINS` |
| `nfr_impacts` | `NFR_IMPACTS` |
| `nfr_constrains` | `NFR_CONSTRAINS` |
| `cross_file_depends` | `CROSS_FILE_DEPENDS` |
| `verifies` | `VERIFIES` |
| `implements` | `IMPLEMENTS` |
| `proves` | `PROVES` |
| `traces_to` | `TRACES_TO` |

### 步骤 3：参数化注入防护

所有节点/边属性值必须通过参数化（`$paramName`）传递，**严禁字符串拼接**。对于无法参数化的批量场景，生成 `:param` 块或 `UNWIND` 语句：

```cypher
:param nodes => [
  {id: 'IR-NODE-0001', type: 'requirement', module: 'Auth', ...},
  {id: 'IR-NODE-0002', type: 'requirement', module: 'Auth', ...}
]
UNWIND $nodes AS node
MERGE (n:Requirement {id: node.id})
ON CREATE SET n.type = node.type, n.module = node.module, ...
```

### 步骤 4：汇总输出

将所有 `MERGE` 语句按"节点 → 边"顺序写入单一 `.cypher` 文件。

## 约束

1. **必须用 `MERGE` 而非 `CREATE`**：保证脚本可幂等执行，重复执行不产生重复节点/边
2. **必须参数化注入**：所有属性值通过 `$paramName` 传递；严禁字符串拼接构造 Cypher 语句（防注入）
3. **Label/Type 映射按 `references/cypher-generation-guide.md`**：不得自行命名 label 或 relationship type
4. **节点先于边**：文件中所有节点 MERGE 必须在边 MERGE 之前，保证 MATCH 可成功
5. **不修改 IR**：本执行者只读 `srs-ir.json`，不写回
6. **不引用 draft 产物**：Cypher 图谱是确定性产物，不依赖 BDD/TLA+/Lean 的 draft 或 verified 产物
7. **id 字段为唯一约束**：所有 MERGE 必须以 `id` 作为唯一键，不得用其他字段组合
8. **空值处理**：属性值为 `null`/`undefined` 时跳过该属性，不写入 `SET` 子句

## 产出

**文件**：`outputs/graphs/srs-graph.cypher`（相对于 `.srs_formalizer` 工作目录根）

**格式**：纯文本 Cypher 脚本，可被 `neo4j-shell` 或 Neo4j Browser 直接执行；含 `:param` 块与 `UNWIND`/`MERGE` 语句。

## 完成后

产出 `outputs/graphs/srs-graph.cypher` 后，调用门禁校验：

```bash
npx tsx index.ts validate-cypher --file outputs/graphs/srs-graph.cypher --workdir .srs_formalizer
```

- 通过（`status: "ok"`）：进入 Backend B2（BDD 生成）
- 失败（`status: "error"`）：按错误信息修正 Cypher 后重新调用，不得绕过门禁

## 参考

- DESIGN.md §4.4（Backend 阶段 B1）、§7.5（validate-cypher 4 项检查）
- `references/cypher-generation-guide.md`（label/type 映射、参数化注入防护、UNWIND 模式）
- `references/ir-schema-reference.md`（节点/边类型与属性）

## ❌ 视觉检查点（失败模式速查）

- ❌ 用 `CREATE` 而非 `MERGE` → 重复执行产生重复节点/边 → 必须用 `MERGE`，以 `id` 为唯一键
- ❌ 字符串拼接构造 Cypher → 注入风险 → 所有属性值通过 `$paramName` 参数化
- ❌ 节点 MERGE 在边 MERGE 之后 → MATCH 失败 → 文件中节点先于边
- ❌ label/type 自行命名 → 与 `cypher-generation-guide.md` 不一致 → 严格按映射表命名
- ❌ 空值写入 SET 子句 → Neo4j 写入 null → 跳过 `null`/`undefined` 属性
- ❌ 引用 draft 产物 → 越权消费 → Cypher 是确定性产物，不依赖 BDD/TLA+/Lean draft
