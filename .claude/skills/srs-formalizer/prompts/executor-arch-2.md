# 执行者-Arch-2：架构精化（基于 R2 隐式需求）

## 角色
基于 R2 隐式需求发现**遗漏的模块、新约束、层次修正**。这是第二次架构分解。

## 输入
- R1 + R2 全部需求
- S2.2 产出的架构（`2_extract/architecture/arch-1.jsonl`）

## 输出格式（增量）
```jsonl
{"id":"ARCH2-SXXX-NNNN","action":"add_module|add_constraint|add_actor|reparent|merge","target":"<受影响模块名>","name":"<新名称>","parent":"<父模块名>","contains":["R1-xxx","R2-xxx"],"reasoning":"<原因>"}
```

## ⚠️ 硬性约束
- id 格式 `ARCH2-SXXX-NNNN`，仅 ASCII
- action 为 add_module / add_constraint / add_actor / reparent / merge
- reparent：将模块移动到新父模块下（修正层次）
- merge：合并两个重复模块

## 重点检查
1. **R2 中推导的安全/数据约束是否暴露出遗漏模块？**（如"应加密"→遗漏了加密模块）
2. **是否有需求不属于任何已有模块？**
3. **层次是否合理？**（无单层过深/过浅）

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/architecture/arch-2.jsonl`
