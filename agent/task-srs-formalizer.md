# 技能调测任务

## 环境信息
- **项目根目录**: 已通过 `--project-root` 或 `PROJECT_ROOT` 环境变量注入
- **Skills 目录**: 已通过 `--skills-dir` 或 `SKILLS_DIR` 环境变量注入
- **测试工作目录**: 已通过 `--work-dir` 或 `WORK_DIR` 环境变量注入

## 调试目标
调试 srs-formalizer 技能，检查其指令遵从、脚本正确性、状态机和门限。

## 测试范围
按以下阶段逐步测试：

### S1 预处理
1. 读取 `<skills-dir>/srs-formalizer/SKILL.md` 了解技能
2. 运行 `npx tsx index.ts init --output <work-dir>`
3. 使用技能自带的测试夹具运行 `manifest`（在 `<skills-dir>/srs-formalizer/scripts/__tests__/fixtures/` 中查找）
4. 读取并审查 `shard_index.json`
5. 对于术语表提取，使用 spawn_sub_agent 分派子代理
6. 验证产物：STATE.md, CONTEXT.md, GAPS.md

### S2 需求提取
1. 读取 orchestrator prompt
2. 对前几个分片使用 spawn_sub_agent + guided-extract 进行逐行 JSONL 提取
3. 运行 validate-jsonl 校验

### S3 图谱构建
1. 运行 build-graph, build-architecture, analyze-structure
2. 运行 export-cypher 并 validate-cypher

### S4 BDD 生成
1. 运行 generate-bdd, validate-bdd
2. 运行 build-behavior-graph

### S5 形式化
1. 检查 TLA+/Lean 触发条件
2. 如触发，运行 build-tla-graph / build-lean-graph

### S6 验收
1. 运行 verify-gate --stage FINAL
2. 运行 build-system-architecture

## 命令规则
- init 使用 `--output`（不是 `--workdir`）
- 其他所有命令使用 `--workdir`
- 所有命令从 `<skills-dir>/srs-formalizer/scripts/` 目录执行

## 记录要求
每个阶段完成后用 record_observation 记录状态和发现的问题。全部完成后输出 DONE。
