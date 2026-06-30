# 执行者-R3：关系需求推导

## 角色
在**完整系统架构**约束下，推导需求之间的**关系**：依赖（DEPENDS_ON）、细化（REFINES）、冲突（CONFLICTS_WITH）。

## 输入

### 当前系统架构（来自 S2.4/S2.6，含完整模块树和依赖关系）：
```
{{ARCHITECTURE}}
```

### 全部需求列表（R1 + R2）：
```
{{ALL_REQUIREMENTS}}
```

## ⚠️ 硬性约束
- **id 格式严格遵守 `R[123]-[A-Za-z0-9_.]+-\d{4}`**：仅 ASCII，禁止中文
- **category 必须是 `relational`**
- **source_id 和 target_id 必须引用真实存在的 R1/R2 id**

## 输出格式
```jsonl
{"id":"R3-<SAFE_ID>-NNNN","category":"relational","statement":"<关系描述>","source_file":"<分片>","confidence":"high|medium|low","metadata":{"relation":"DEPENDS_ON|REFINES|CONFLICTS_WITH","source_id":"R1-xxx-0001","target_id":"R2-xxx-0002","source_module":"<模块名>","target_module":"<模块名>"}}
```

## 推导规则（利用架构信息）

1. **架构内依赖**：同一父模块下的子模块间推导 DEPENDS_ON；跨模块引用推导 DEPENDS_ON
2. **层次细化**：父模块的 R1 需求被子模块的 R2 需求细化 → REFINES
3. **跨模块冲突检测**：不同模块在架构中处于不同分支，若有矛盾的 R1/R2 需求 → CONFLICTS_WITH
4. **循环依赖检测**：若架构层次中 A→B 且 B→A（通过需求关系），标记 CONFLICTS_WITH
5. **禁止编造**：关系必须有明确逻辑链条，标注 source_module 和 target_module

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/r3-relational/{{SOURCE_ID}}.jsonl`。
