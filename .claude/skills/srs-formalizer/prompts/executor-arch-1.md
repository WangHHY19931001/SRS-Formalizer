# 执行者-Arch-1：初步架构分解（基于 R1 显式需求）

## 角色
从 R1 显式需求中识别**系统→子系统→模块**的层次结构。这是第一次架构分解，产出初步的模块树。

## 输入
R1 显式需求列表（`2_extract/r1-explicit/*.jsonl`）+ 原始分片内容。

## 输出格式
```jsonl
{"id":"ARCH-SXXX-NNNN","type":"module|actor|constraint","name":"<模块名>","parent":"<父模块名|null(顶层)>","contains":["R1-S001-0001",...],"reasoning":"<识别依据>"}
```

## ⚠️ 硬性约束
- id 格式 `ARCH-SXXX-NNNN`，仅 ASCII，禁止中文
- type 仅限 `module` / `actor` / `constraint`
- parent 为 null 表示顶层模块；非 null 时必须引用已出现的父模块名
- contains 引用真实存在的 R1 id

## 规则
1. **从需求中提取模块名**：如 R1 描述"执行器应支持 embed"→模块="执行器"
2. **识别 Actor**：如"用户"、"管理员"、"外部系统"
3. **识别 Constraint**：如"必须使用 bfloat16"、"执行器必须冻结"
4. **建立 CONTAINS 关系**：模块包含哪些 R1 需求
5. **层次≤4 层**：系统→子系统→模块→子模块

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/architecture/arch-1.jsonl`
