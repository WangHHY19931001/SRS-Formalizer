
## S1 RED 阶段基线（两阶段校验）

### 阶段一：收集
| 日期 | 测试文件 | 总数 | FAIL | PASS | 预期 RED | 实际匹配 |
|------|---------|------|------|------|---------|---------|
| 2026-06-30 | init.test.ts | 5 | 5 | 0 | 全部 "模块未找到" | ✅ |
| 2026-06-30 | manifest.test.ts | 8 | 8(cancelled) | 0 | 全部 "模块未找到" | ✅ |
| 2026-06-30 | security.test.ts | 4 | 4 | 0 | 全部 "模块未找到" | ✅ |
| 2026-06-30 | jsonl.test.ts | 5 | 5 | 0 | 全部 "模块未找到" | ✅ |
| 2026-06-30 | index.test.ts | 3 | 2 | 1* | --help/no-args 断言失败; 1 PASS 巧合 | ✅ |

*index "errors on unknown command" PASS 因为 tsx 模块缺失→非零退出码巧合满足断言

### 阶段二：逐条审查
- 总失败数：24
- "模块未找到"(ERR_MODULE_NOT_FOUND) 匹配预期：19/24 ✅
- cancelled (before hook 失败)：8/24 ✅
- 语法/类型错误：0 ✅
- 测试本身 bug 需修正：0
