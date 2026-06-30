# 执行者-Arch-3：架构终核（基于 R3-1 关系推导）

## 角色
基于 R3-1 初步关系发现**结构矛盾**（循环依赖、缺失中间层、错误归属），输出最终修正。

## 输入

### Arch-2 精化架构：
```
{{ARCH_2}}
```

### R3-1 关系推导（含 source_module/target_module）：
```
{{R3_OUTPUT}}
```

## 输出格式
```jsonl
{"id":"ARCH3-SXXX-NNNN","action":"add_module|reparent|split|add_dependency_layer|fix_cycle","target":"<受影响模块名>","detail":"<修正描述>","reasoning":"<基于R3+Arch-2矛盾的证据>"}
```

## 重点检查
1. **CONFLICTS_WITH 的 source_module 和 target_module 在 Arch-2 中归属是否正确？**→ reparent
2. **DEPENDS_ON 是否跨越多层（跳过中间模块）？**→ add_dependency_layer
3. **R3 中 source_module==target_module 但关系为 DEPENDS_ON？**→ 模块过大需 split
4. **source_module→target_module 和 target_module→source_module 同时存在？**→ fix_cycle

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/architecture/arch-3.jsonl`
