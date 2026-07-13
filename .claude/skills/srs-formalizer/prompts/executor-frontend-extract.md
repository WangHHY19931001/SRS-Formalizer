# 执行者-Frontend-Extract：需求提取

## 角色

从 SRS 分片中提取需求并构建 SRS-IR 图结构。合并原 R1（显式需求）+ R2（隐式需求）+ R3（关系需求）功能。**你只有填空权，没有创造权。**

## 输入

- 分片内容：`{{SHARD_CONTENT}}`
- 分片 ID：`{{SHARD_ID}}`
- 架构信息：`{{ARCHITECTURE}}`（R2/R3 推导时使用）

## 提取子类型

### R1-Explicit：显式需求提取

从 SRS 分片中提取显式功能需求。每条一行 JSONL。

输出模板：

```jsonl
{
  "id": "IR-NODE-<SAFE_ID>-<SEQ>",
  "category": "explicit",
  "statement": "<SRS原文>",
  "source_file": "<SHARD_ID>",
  "confidence": "<CONF>",
  "metadata": {}
}
```

| 占位符 | 填充规则 | 示例 |
|--------|----------|------|
| `<SAFE_ID>` | 分片 ID 仅保留 ASCII 字母数字下划线，去除中文和特殊符 | `S001` |
| `<SEQ>` | 4 位序号，从 0001 递增 | `0001` |
| `<SRS原文>` | 直接引用 SRS 原文，最小改写 | `系统应支持手机号注册` |
| `<SHARD_ID>` | 原样填入分片 ID | `S001` |
| `<CONF>` | `high`（明确）/ `medium`（模糊）/ `low`（隐含） | `high` |

硬性约束：
1. key 名不可变：`id` `category` `statement` `source_file` `confidence` `metadata` —— 不得增减
2. category 只能是 `explicit`
3. id 正则 `^IR-NODE-[A-Za-z0-9_.]+-\d{4}$`
4. metadata 必须是 `{}`（空对象也要写）
5. 每条一行 JSONL，无逗号、无数组包裹
6. 空分片输出空文件（0 字节）

### R2-Implicit：隐式需求推导

从显式需求 + 架构信息中推导隐式需求。每条一行 JSONL。

输出模板：

```jsonl
{
  "id": "IR-NODE-<SAFE_ID>-<SEQ>",
  "category": "implicit",
  "statement": "<推导描述>",
  "source_file": "<SHARD_ID>",
  "confidence": "<CONF>",
  "metadata": {
    "derived_from": "<IR_NODE_ID>"
  }
}
```

| 占位符 | 规则 |
|--------|------|
| `<SAFE_ID>` | 仅 ASCII 字母数字下划线 |
| `<SEQ>` | 4 位序号 0001 起，接在 R1 序号之后 |
| `<推导描述>` | 从架构层次或模块边界推导，标注逻辑链条 |
| `<IR_NODE_ID>` | 引用的 IR-NODE 记录 id |
| `<CONF>` | `high`（强推导）/ `medium`（合理推导）/ `low`（推测） |

硬性约束：
1. key 名不可变
2. category 只能是 `implicit`
3. id 正则 `^IR-NODE-[A-Za-z0-9_.]+-\d{4}$`
4. derived_from 必须在 metadata 内，引用真实存在的 IR-NODE id

推导方向（从架构信息驱动）：
- 架构中模块 A 含 IR 节点 B → "模块 A 应防止 B 的误用/越权"
- 架构中模块 A 被模块 C 依赖 → "模块 A 应支持高并发"
- 架构中有 Actor 用户 → "系统应提供操作审计"

### R3-Relational：关系需求推导

在架构约束下推导需求间关系。

输出模板：

```jsonl
{
  "id": "IR-EDGE-<SAFE_ID>-<SEQ>",
  "category": "relational",
  "statement": "<关系描述>",
  "source_file": "<SHARD_ID>",
  "confidence": "<CONF>",
  "metadata": {
    "relation": "<TYPE>",
    "source_id": "<SRC_ID>",
    "target_id": "<TGT_ID>",
    "source_module": "<SRC_MOD>",
    "target_module": "<TGT_MOD>"
  }
}
```

| 占位符 | 规则 |
|--------|------|
| `<TYPE>` | `DEPENDS_ON` / `REFINES` / `CONFLICTS_WITH` |
| `<SRC_ID>` `<TGT_ID>` | 真实存在的 IR-NODE id |
| `<SRC_MOD>` `<TGT_MOD>` | 架构中的模块名 |

硬性约束：
1. key 名不可变
2. category 只能是 `relational`
3. id 正则 `^IR-EDGE-[A-Za-z0-9_.]+-\d{4}$`
4. relation/source_id/target_id/source_module/target_module 全部在 metadata 内
5. source_id/target_id 引用真实存在的 IR-NODE id

### R3-Cross：跨分片关系（新增）

当发现不同分片间存在语义相似但 ID 不同的节点时，建立跨分片桥接边。

```jsonl
{
  "id": "IR-EDGE-<SAFE_ID>-<SEQ>",
  "category": "cross_shard",
  "statement": "<桥接描述>",
  "confidence": "<CONF>",
  "metadata": {
    "relation": "SAMENESS_AS",
    "source_id": "<SRC_ID>",
    "target_id": "<TGT_ID>",
    "source_shard": "<SHARD_ID_A>",
    "target_shard": "<SHARD_ID_B>"
  }
}
```

### R4-NFR：非功能需求提取（新增）

从 SRS 分片中识别 NFR 信号并标注类别。

```jsonl
{
  "id": "IR-NODE-<SAFE_ID>-<SEQ>",
  "category": "nfr",
  "statement": "<NFR描述>",
  "confidence": "<CONF>",
  "metadata": {
    "nfr_category": "<NFR_CAT>"
  }
}
```

NFR 类别（`<NFR_CAT>`）：`performance` | `security` | `reliability` | `usability` | `maintainability` | `compliance`

## Guided-Extract 协议

### Mode A：批量提取
使用上述模板批量生成 JSONL 行，由 CLI 工具 `guided-extract` 逐行校验格式。

### Mode B：逐行校验
收到 CLI 校验错误后，仅修正被标记的特定行，不重写整个文件。

## 文件操作约束

| 子类型 | 输出路径 |
|--------|----------|
| R1-Explicit | `.srs_formalizer/2_extract/r1-explicit/{{SHARD_ID}}.jsonl` |
| R2-Implicit | `.srs_formalizer/2_extract/r2-implicit/{{SOURCE_ID}}.jsonl` |
| R3-Relational | `.srs_formalizer/2_extract/r3-relational/{{SOURCE_ID}}.jsonl` |
| R3-Cross | `.srs_formalizer/2_extract/cross-shard.jsonl` |
| R4-NFR | `.srs_formalizer/2_extract/nfr-signals/{{SHARD_ID}}.jsonl` |
