# 子项目 3B-3E：Backend Emitter 完整实现计划

**日期**: 2026-07-13 | **范围**: 编译器架构重构 Phase 3B-3E
**前置**: 子项目 3A 完成（图谱组 4 Emitter, 424 tests pass, branch: `feat/subproject-3a-emitters-graph`）

---

## 1. 任务分组

| 阶段 | Emitter 数 | 核心文件 | 测试文件 |
|------|:--:|------|------|
| 3B BDD组 | 1 + 校验层 | 7 | 3 |
| 3C 形式化组 | 2 | 2 | 2 |
| 3D V-Model组 | 3 | 4 (含 nfr.ts 重写) | 3 |
| 3E 验证组 | 3 | 5 | 3 |
| CLI收尾 | — | command/emit.ts + index.ts | — |

---

## 2. 关键决策摘要

- GherkinEmitter 三文件拆分（emitter + module-gen + nfr-gen）
- NFR 统一 6 类，每类 3 场景模板，Mustache `{{placeholder}}`
- 四级校验全硬阻塞（Phase1 TS + Phase2 NFR + Phase3 gherkin-lint + Phase4 Gherklin）
- TLA+ 全覆盖，层次拆解基于 IR 架构节点，6 类 NFR 不变式全生成
- FixtureEmitter 薄封装 `lib/fixture-gen/`，nfr.ts 重写为 6 类

---

## 3. 验证标准

```bash
npx tsc --noEmit && npx tsx --test __tests__/*.test.ts  # 全部 pass
```

## 4. 不变约束

零运行时 npm 依赖、Strict TS、0 `any`、max 300 lines/file、`path.join()` only、refuseDirectInvocation。
