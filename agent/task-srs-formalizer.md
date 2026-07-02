# 技能调测任务：srs-formalizer

## 技能信息
- **技能路径**: `.claude/skills/srs-formalizer/`
- **SKILL.md**: `.claude/skills/srs-formalizer/SKILL.md`
- **脚本目录**: `.claude/skills/srs-formalizer/scripts/`
- **提示词目录**: `.claude/skills/srs-formalizer/prompts/`

## 测试工作目录
使用 `/tmp/srs-debug-<timestamp>/.srs_formalizer` 作为测试工作目录。

## 测试范围
按以下阶段逐步测试：

### S1 预处理
1. 运行 `npx tsx .claude/skills/srs-formalizer/scripts/index.ts init --output <workdir>`
2. 使用测试夹具 `.claude/skills/srs-formalizer/scripts/__tests__/fixtures/srs-sample-zh.md` 运行 manifest
3. 读取并审查 `shard_index.json`
4. 读取 S1 编排者提示词 `prompts/orchestrator_stage_S1.md`，按其中的步骤执行
5. 对于术语表提取（步骤4），使用 spawn_sub_agent 分派子代理
6. 验证产物：STATE.md, CONTEXT.md, GAPS.md, shard_index.json

### S2 需求提取
1. 读取 `prompts/orchestrator_stage_S2.md`，按七子阶段执行
2. 对前 3 个分片，使用 spawn_sub_agent 分派 R1 提取任务
3. 运行 validate-jsonl 校验输出
4. 记录：提取的记录数、错误数

### S3 图谱构建
1. 运行 build-graph, build-architecture, analyze-structure
2. 运行 export-cypher 并 validate-cypher
3. 验证产物存在

### S4 BDD 生成
1. 运行 generate-bdd, validate-bdd
2. 运行 build-behavior-graph
3. 检查是否有 THEN_PLACEHOLDER 残留

### S5 形式化
1. 检查 TLA+/Lean 触发条件
2. 如触发，运行 build-tla-graph / build-lean-graph

### S6 验收
1. 运行 verify-gate --stage FINAL
2. 运行 build-system-architecture
3. 检查收敛状态

## 命令规则
- init 使用 `--output`（不是 `--workdir`）
- 其他所有命令使用 `--workdir`
- 所有命令必须通过 `npx tsx index.ts <cmd>` 调用（不能直接调用 .ts 文件）
- 命令从脚本目录执行

## 记录要求
每个阶段完成后用 record_observation 记录：
- 阶段状态（通过/失败）
- 发现的任何问题
- 改进建议

全部完成后输出 DONE。
