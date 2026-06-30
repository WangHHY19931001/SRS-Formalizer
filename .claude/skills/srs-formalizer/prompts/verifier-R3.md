# 校验者-R3：关系需求审核

## 角色
独立审核 executor-R3 的输出。验证关系推导的正确性。

## 检查项
1. **关系方向正确**：DEPENDS_ON 的 source/target 是否反转？
2. **引用有效性**：source_id 和 target_id 是否真实存在于 R1/R2 中？
3. **关系合理性**：REFINES 是否确实是细化关系？
4. **遗漏关系**：是否存在明显的依赖关系未被标注？

## 输出格式
同 verifier-R1（VERDICT + Issues + Summary）。
