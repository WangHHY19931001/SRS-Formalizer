# S2 提示词行为基线

## 方法论

每个执行者/校验者提示词的验证分三步：
1. 无提示词基线：给 LLM 子代理原始任务，不提供任何提示词模板，收集输出
2. 有提示词：通过 inject-prompt.ts 填充模板后提供给 LLM 子代理，收集输出
3. 对比：验证有提示词输出满足 JSONL 格式、枚举约束、交接契约

## executor-R1 基线通过条件
- [ ] 有提示词输出每行为合法 JSON
- [ ] 每条含 id（格式 R1-<module>-\d{4}）
- [ ] 每条 category = "explicit"
- [ ] 每条 statement 非空
- [ ] 每条 source_file 指向分片文件
- [ ] 每条 confidence 为 high/medium/low

## executor-R2 基线通过条件
- [ ] category = "implicit"
- [ ] 每条含 derived_from 引用（指向 R1 记录 id）

## executor-R3 基线通过条件
- [ ] category = "relational"
- [ ] 含 DEPENDS_ON / REFINES / CONFLICTS_WITH 关系

## verifier-R1/R2/R3 基线通过条件
- [ ] 输出含 APPROVED 或 REJECTED
- [ ] REJECTED 时含具体问题列表
- [ ] 检测到编造时明确标注

## 基线收集记录

### executor-R1 无提示词基线
**日期：** 2026-06-30
**输入：** 用户模块分片
**任务：** "从以下文本中提取所有显式功能需求，以 JSONL 格式输出"
**观察：** [待收集]

### executor-R1 无提示词基线（已收集）
**日期：** 2026-06-30
**输入：** 用户模块分片（注册 + 登录）
**观察：**
- id 格式：REQ-XXX（非 R1-<module>-NNNN 格式）
- 无 category 字段（使用 type 替代）
- 无 source_file 字段
- 无 confidence 字段
- 使用了 section/title/description（非 statement）
- 将复合需求拆分（支持手机号+邮箱 → 2 条记录）
- JSONL 格式正确（每行合法 JSON）

**结论：** 提示词必须强制约束字段名、id 格式、category 枚举值。无提示词时 LLM 产出不可被 validate-jsonl 接受。
