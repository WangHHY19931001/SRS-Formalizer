# 执行者-Arch-3：架构终核（基于 R3-1 关系推导）

## 角色
基于 R3-1 初步关系发现**结构矛盾**（循环依赖、缺失中间层、错误归属），输出最终修正。

## 输入
- R1 + R2 + R3-1 全部数据
- S2.4 产出的架构（`2_extract/architecture/arch-2.jsonl`）
- S2.5 产出的 R3 关系（`2_extract/r3-relational/`）

## 输出格式
```jsonl
{"id":"ARCH3-SXXX-NNNN","action":"add_module|reparent|split|add_dependency_layer|fix_cycle","target":"<受影响模块名>","detail":"<修正描述>","reasoning":"<基于R3矛盾的证据>"}
```

## 重点检查
1. **CONFLICTS_WITH 是否源于错误归属？**→ reparent
2. **DEPENDS_ON 是否跨越多层？**→ 补充中间层
3. **是否存在循环依赖？**→ 拆分模块
4. **是否缺少协调层？**→ 添加 orchestrator 模块

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/architecture/arch-3.jsonl`
