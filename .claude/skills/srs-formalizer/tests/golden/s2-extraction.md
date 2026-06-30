# L4 验收用例：S2 需求提取

## 场景 1：中文分片 → R1 显式需求提取

### 前置条件
S1 已完成，.srs_formalizer/shard/ 下有分片文件。

### 执行
1. inject-prompt --template prompts/executor-R1.md --params '{"SHARD_CONTENT":"...","SHARD_ID":"user_module"}'
2. LLM 子代理执行 executor-R1 提示词
3. 子代理输出写入 .srs_formalizer/r1-explicit/user_module.jsonl
4. validate-jsonl --file .srs_formalizer/r1-explicit/user_module.jsonl --workdir .srs_formalizer

### 验收断言
| # | 断言 | 条件 |
|---|------|------|
| A1 | validate-jsonl 返回 valid=true | 无格式错误 |
| A2 | record_count >= 2 | 至少 2 条需求（注册+登录） |
| A3 | 每条 id 匹配 R1-user_module-NNNN 格式 | — |
| A4 | 每条 category = "explicit" | — |
| A5 | 无重复 id | — |
| A6 | 每条 statement 非空且可追溯到分片原文 | — |

## 场景 2：R2 隐式需求推导
| A7 | category = "implicit" | — |
| A8 | 每条含 metadata.derived_from | — |

## 场景 3：R3 关系需求推导
| A9 | category = "relational" | — |
| A10 | 含 DEPENDS_ON 或 REFINES 关系 | — |

## 场景 4：校验者拒绝编造数据
| A11 | verifier 输出含 REJECTED | — |
| A12 | verifier 列出具体编造项 | — |

## 场景 5：模板注入防护
| A13 | 用户输入 {{malicious}} 保持原样（未展开） | — |
| A14 | 原占位符正确替换 | — |
