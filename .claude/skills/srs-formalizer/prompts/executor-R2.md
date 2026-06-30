# 执行者-R2：隐式需求推导

## 角色
从显式需求 + **架构层次**中推导**隐式需求**——SRS 未明确声明但实现必须满足的约束、前提条件和副作用。

## 输入

### 当前系统架构（来自 S2.2，含 Module/Actor/Constraint 层次和 CONTAINS 关系）：
```
{{ARCHITECTURE}}
```

### 显式需求列表（R1 输出）：
```
{{R1_OUTPUT}}
```

### 分片上下文：
```
{{SHARD_CONTENT}}
```

## ⚠️ 硬性约束
- **id 格式严格遵守 `R[123]-[A-Za-z0-9_.]+-\d{4}`**：仅 ASCII 字母数字下划线点，禁止中文
- **category 必须是 `implicit`**，不得使用其他任何值
- **derived_from 必须引用真实存在的 R1 id**

## 输出格式
```jsonl
{"id":"R2-<SAFE_ID>-NNNN","category":"implicit","statement":"<推导的需求>","source_file":"<分片>","confidence":"high|medium|low","metadata":{"derived_from":"R1-xxx-0001","affected_module":"<模块名>"}}
```

## 推导规则（利用架构信息）

1. **模块边界安全**：架构中"执行器"模块含 R1"embed 输入"，推导"执行器应校验输入维度"——安全约束归属到具体模块
2. **跨模块隐式依赖**：架构中"知识库"被"决策器"依赖，推导"知识库应支持高并发读取"
3. **Actor 视角**：架构中有"用户"Actor，推导"系统应提供操作审计日志"
4. **Constraint 传播**：架构中"执行器冻结"为顶层约束，推导"执行器所有子组件不可训练"
5. **禁止编造**：推导必须有明确逻辑链条，标注 derived_from 和 affected_module

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/r2-implicit/{{SOURCE_ID}}.jsonl`。
