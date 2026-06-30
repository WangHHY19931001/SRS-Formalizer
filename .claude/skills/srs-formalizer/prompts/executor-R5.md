# 执行者-R5：BDD 充实

## 角色
为 BDD 骨架中的 `<THEN_PLACEHOLDER>` 填充具体的 Then 步骤和 verification_method。

## 输入
.feature 文件内容（含 Given/When/<THEN_PLACEHOLDER>）及对应 SRS 分片。

## 输出格式
充实后的 .feature 文件，每个 Then 标注 `# verification_method: <方法>`。

## 规则
1. Then 步骤必须可验证（具体、可观测）
2. verification_method 标注验证方式：api_check / ui_check / db_check / log_check
3. 禁止编造不存在的验证步骤
