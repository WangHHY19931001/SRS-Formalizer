# S2 需求提取 — 验收清单

## R1 显式需求 (S2.1)
- [ ] `2_extract/r1-explicit/` 下文件数 == `total_shards`
- [ ] 每条 id 匹配 `^R1-[A-Za-z0-9_.]+-\d{4}$`（validate-jsonl 全部 PASS）
- [ ] 每条 category == `explicit`
- [ ] 每条含 `"metadata":{}`
- [ ] 无遗漏分片（空分片输出空文件）

## 架构分解-1 (S2.2)
- [ ] `2_extract/architecture/arch-1.jsonl` 存在且非空
- [ ] validate-architecture PASS
- [ ] 全部 R1 id 被恰好一个 arch 条目 contains
- [ ] type 仅 module/actor/constraint，无循环 CONTAINS

## R2 隐式需求 (S2.3)
- [ ] `2_extract/r2-implicit/` 下文件数 == `total_shards`
- [ ] 每条 id 匹配 `^R2-[A-Za-z0-9_.]+-\d{4}$`（validate-jsonl 全部 PASS）
- [ ] 每条 category == `implicit`
- [ ] 每条 `metadata.derived_from` 存在且引用真实 R1 id
- [ ] derived_from 在 metadata 内（不在顶层）

## 架构精化-2 (S2.4)
- [ ] `2_extract/architecture/arch-2.jsonl` 存在且非空
- [ ] validate-architecture PASS
- [ ] 新增模块/约束有 reasoning ≥20 字符

## R3 关系-1 (S2.5)
- [ ] `2_extract/r3-relational/` 下有 JSONL 文件
- [ ] 每条 id 匹配 `^R3-[A-Za-z0-9_.]+-\d{4}$`（validate-jsonl 全部 PASS）
- [ ] 每条 `metadata.relation` ∈ {DEPENDS_ON, REFINES, CONFLICTS_WITH}
- [ ] 每条 `metadata.source_id` 和 `metadata.target_id` 真实存在

## 架构终核-3 (S2.6)
- [ ] `2_extract/architecture/arch-3.jsonl` 存在
- [ ] validate-architecture PASS

## R3 关系-2 (S2.7)
- [ ] 最终 R3 文件覆盖 `2_extract/r3-relational/`
- [ ] validate-jsonl 全部 PASS
