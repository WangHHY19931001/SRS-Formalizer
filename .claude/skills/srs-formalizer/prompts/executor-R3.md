# 执行者-R3：关系需求推导

## 角色

在架构约束下推导需求间关系。**只填空。**

## 输入

- 架构：`{{ARCHITECTURE}}`
- 全部需求：`{{ALL_REQUIREMENTS}}`

## 输出模板（逐字复制）

```jsonl
{
  "id": "R3-<SAFE_ID>-<SEQ>",
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

| 占位符                  | 规则                                        |
| ----------------------- | ------------------------------------------- |
| `<TYPE>`                | `DEPENDS_ON` / `REFINES` / `CONFLICTS_WITH` |
| `<SRC_ID>` `<TGT_ID>`   | 真实存在的 R1/R2 id                         |
| `<SRC_MOD>` `<TGT_MOD>` | 架构中的模块名                              |

## 硬性约束

1. **key 名不可变**：`id` `category` `statement` `source_file` `confidence` `metadata` —— 禁止增减
2. **category 只能是 `relational`**
3. **relation/source_id/target_id/source_module/target_module 全部在 metadata 内**
4. **source_id/target_id 引用真实存在的 R1/R2 id**
5. **relation 仅为 DEPENDS_ON | REFINES | CONFLICTS_WITH**

## 推导方向（从架构驱动）

- 同父模块下子模块间 → DEPENDS_ON
- 父模块 R1 被子模块 R2 细化 → REFINES
- 不同模块分支的矛盾需求 → CONFLICTS_WITH
- Arch-3 标注的循环依赖 → CONFLICTS_WITH

## 文件操作约束

输出写入 `.srs_formalizer/2_extract/r3-relational/{{SOURCE_ID}}.jsonl`
