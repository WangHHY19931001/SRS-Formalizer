# 产物格式契约速查表（Artifact Contract Cheatsheet）

> 本表集中列出各阶段产物的**确切字段名、枚举值、门禁期望文件名**，消除「契约未文档化 → 靠读源码试错」的调试摩擦（评估报告 §2 阻塞点 #1–#8、§P1-4）。凡本表与源码不一致，以源码为准并回报修正本表。

---

## 1. JSONL 需求记录（R1/R2/R3）

`2_extract/{r1-explicit,r2-implicit,r3-relational}/<shard_id>.jsonl`，每行一条：

| 字段 | 类型 | 合法值 / 格式 | 说明 |
|------|------|---------------|------|
| `id` | string | `R[123]-<shard_id>-NNNN`（如 `R1-S005-0001`） | 必填；shard 段用于 S1 覆盖率核验 |
| `category` | string | `explicit` \| `implicit` \| `relational` | 必填；**注意与 IR 节点层的 category 语义不同（见 §5）** |
| `statement` | string | 非空 | 必填 |
| `source_file` | string | 非空 | 必填 |
| `confidence` | string | `high` \| `medium` \| `low` | 必填 |
| `metadata` | object | 可选：`shard_id` / `chapter` / `start_line` / `end_line` / `formalization_priority` / `rid_ref` / `provenance` | 可选 |

- **文件命名**：逐分片 `<shard_id>.jsonl`（如 `S005.jsonl`）。**禁止区间命名**（`S001_S003.jsonl`）——门禁按记录 id 的 shard 段统计覆盖率，区间文件名会掩盖缺口。
- **零规范分片**：无可提取规范的分片，其 id 追加到 `2_extract/r1-explicit/_empty_shards.json`（JSON 字符串数组），否则 S1 分片覆盖率核验判 FAIL。

### 1.1 三态 provenance（`metadata.provenance`，守 Inversion 铁律）

每条推导/补全需求（尤其 R2/R3）必须落入且仅落入一态：

| provenance | 判据 | 落地要求 | 能否进 IR |
|------------|------|----------|:--:|
| `explicit-located` | 源文档可逐字定位 | `category: explicit`，带 `source_shard`+行号 | ✅ |
| `doc-derived` | 文档可推导但非逐字 | `category: implicit` 且 `confidence: medium`\|`low` | ✅ |
| `needs-clarification` | 文档推导不出的决策点 | **不进 IR**，写 `GAPS.md`，走 HITL 单问题澄清 | ❌ |

- `validate-jsonl` 硬校验：`metadata.provenance` 若存在必须是三态之一，否则 FAIL。
- `needs-clarification` 出现在 `r*`/`architecture` JSONL 即 FAIL（只能挂 `GAPS.md`）。
- `doc-derived` 但 `category≠implicit` 或 `confidence` 非 `medium/low` 即 FAIL。
- **唯一事实源 = 设计文档**；`frozen/` 不是输入。推导不出的需求绝不以 explicit/high 混入。

---

## 2. 架构 JSONL 记录

`2_extract/architecture/arch-*.jsonl`：

| 字段 | 适用层 | 合法值 / 格式 |
|------|--------|---------------|
| `id` | 全部 | arch-1 `ARCH-<X>-NNNN`；arch-2 `ARCH2-<X>-NNNN`；arch-3 `ARCH3-<X>-NNNN`（纯 ASCII） |
| `type` | arch-1 | `module` \| `actor` \| `constraint` |
| `action` | arch-2 | `add_module` \| `add_constraint` \| `add_actor` \| `reparent` \| `merge` |
| `action` | arch-3 | `add_dependency_layer` |
| `source_shard` | **arch-1 必填** | `SNNN`（如 `S005`）— §P0-0d 溯源字段，缺失或格式错即 FAIL |
| `arch_version` | 可选（顶层字段） | `1`\|`2`\|`3`，标记所属架构树版本；须与 id 前缀一致（`ARCH-`→1、`ARCH2-`→2、`ARCH3-`→3），非法值或不一致即 FAIL |
| `parent` | 可选 | 必须解析到某条记录的 `name`，否则 FAIL |
| `contains` | 可选 | 字符串数组，每项匹配 `R[12]-<X>-NNNN`；表达子系统层级，支撑 R3 分层深度闸门 |
| `reasoning` | 全部 | 字符串，≥10 字符 |

- **多轮交替演进**：arch-1（v1 基础树）→ arch-2（v2 reparent/merge）→ arch-3（v3 依赖层），与 R1→R2→跨系统补全交替推进。
- **分层深度**：架构树不得塌铺成平铺一层。R3 分层深度闸门要求 `contains` 链最大深度 ≥2，且 ≥3 架构节点时不得全部无层级（`flatTree` 即 FAIL）。

---

## 3. IR 节点 / 边（srs-ir.json，version `2.0.0`）

### 3.1 节点 `properties.category`（IR 层）

合法值：`explicit` | `implicit` | `relational`（**不是** `functional`/`nfr`）。

### 3.2 边字段（小写枚举）

| 字段 | 说明 |
|------|------|
| `source` | 源节点 id（**不是** `source_id`） |
| `target` | 目标节点 id（**不是** `target_id`） |
| `type` | 关系类型（**不是** `relation`），小写枚举见下 |

边 `type` 合法值：`depends_on` \| `refines` \| `conflicts_with` \| `derived_from` \| `same_aspect` \| `contains` \| `nfr_impacts` \| `nfr_constrains` \| `cross_file_depends` \| `verifies` \| `implements` \| `proves` \| `traces_to`

### 3.3 `meta` 必填字段

`sourcePath` / `sourceHash` / `language`(`zh`\|`en`) / `totalChars` / `totalShards` / `totalNodes` / `totalEdges` / `buildTimestamp`。

> **由 `assemble-ir` 自动计算写入**（§P1-5）：`totalNodes`/`totalEdges` 从装配集合计数；`sourcePath`/`sourceHash`/`language`/`totalChars`/`totalShards` 从 `_ctx/shard_index.json` 读取。无需手工补齐。

---

## 4. 门禁期望的确切文件名 / 路径

| 门禁 | 期望产物 | 路径 |
|------|----------|------|
| S1 | 状态文件 | `STATE.md` |
| S1 | 分片索引 | `_ctx/shard_index.json`（含 `source_path` 字段，非 `source_file`） |
| S1 | 术语表 | `GLOSSARY.md`（合并输出，门禁认 `.md` 不认散落 json） |
| S1 | R1 提取 | `2_extract/r1-explicit/*.jsonl` + 可选 `_empty_shards.json` |
| R3 | 图谱 | `3_graph/graph/graph.merged.json`（`assemble-ir` 自动产出，§P1-5）；回退 `graph.json` |
| R3 | 架构 | `2_extract/architecture/*.jsonl` |
| R3 | 孤儿裁决 | `_ctx/orphan_adjudications.json`（可选；孤儿裁决闸门用） |
| FINAL | BDD | `outputs/bdd/verified/*.feature` + `outputs/bdd/validation/*.json` |
| FINAL | TLA+ | `outputs/tlaplus/verified/<module>.tla`+`<module>.cfg` + `validation/*.json`（**按模块集合核验**，§P0-2） |
| FINAL | Lean4 | `outputs/lean4/verified/{lakefile.*, **/*.lean, lean-toolchain?}` + `validation/*.json` |
| FINAL | 保真 | `outputs/reports/fidelity.json` |

---

## 5. 易混淆点警示

- **JSONL 层 `category` vs IR 层 `category`**：JSONL 记录的 `category` 是 `explicit`/`implicit`/`relational`（提取类别）；IR 节点 `properties.category` 同名但语义为需求性质，取值也是 `explicit`/`implicit`/`relational`。**切勿写 `functional`/`nfr`**——两处都会被拒。
- **`source_path` vs `source_file`**：`shard_index.json` 的分片用 `source_path`（源文件绝对路径）；JSONL 需求记录用 `source_file`。
- **GLOSSARY**：门禁要 `GLOSSARY.md`，不认 `glossary-B01.json` 批次文件——需先合并为 `.md`。
- **sourceHash 与路径无关**（§P0-3）：`hashFiles` 按 basename+内容哈希，draft/verified 路径切换不影响 hash，无需手工重算报告 hash。
- **`startLine`/`endLine` 应为行级精度**——指向 SRS 源文件中该需求所在的**具体行号**（如 `startLine: 42, endLine: 45`），不是整个 shard 的行范围（如 `startLine: 1, endLine: 200`）。整分片范围会使多个需求共享同一 source，无法精确定位。
- **IR 节点 `module` 字段应为子系统名**——填写 arch-1 子系统名（如 `AuthService`、`PaymentService`），不是源文件路径（如 `srs.md`）或 shard id（如 `S005`）。子系统名来源：architecture JSONL 的 `contains` 关系或 shard_index 的 module 映射。`assemble-ir` 在无 architecture 信息时用 `shard_id` 作为占位，Middle-end M5 应替换为真实子系统名。

---

## 6. 收敛闸门（R3 双闸门 + 孤儿裁决文件）

多轮提取精细化循环以 `verify-gate --stage R3` 的**双闸门**判定收敛：

### 6.1 分层深度闸门（层次性）

- 沿架构节点间 `contains` 边计算最大链长 `hierarchyDepth`，要求 ≥2（`MIN_HIERARCHY_DEPTH`）。
- ≥3 个架构节点但相互间无 `contains` 层级（`flatTree`）即 FAIL：`"architecture tree is flat; hierarchy collapsed"`。
- 无 `srs-ir.json` 或无架构节点时视为不适用（跳过）。
- 未通过 → 回退 F3a/F3b/F3c 修架构树。

### 6.2 孤儿裁决闸门（连通性）

- 目标 `connectedComponents==1`。孤儿分片不硬 FAIL，逐个裁决。
- 每个孤儿分片必须在 `_ctx/orphan_adjudications.json` 显式声明，或有被接受的桥接边，否则 FAIL。
- 未通过 → 回退 F4a/F4b/F4c 补边/补需求，或为合法独立约束写裁决。

**`_ctx/orphan_adjudications.json` 格式**（JSON 数组）：

```json
[
  { "shardId": "S042", "standalone": true, "reason": "全局合规声明，无需与其他需求连边" }
]
```

| 字段 | 类型 | 要求 |
|------|------|------|
| `shardId` | string | 孤儿分片 id |
| `standalone` | boolean | 必须为 `true` 才生效 |
| `reason` | string | 非空理由；空或缺失则该条裁决无效 |

畸形文件（非数组、字段缺失）按空裁决处理，即所有孤儿仍视为未裁决。
