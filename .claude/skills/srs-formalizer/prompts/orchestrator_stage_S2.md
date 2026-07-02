# S2 编排者指令：需求提取 + 架构分解（七子阶段）

## 角色
你是 SRS-Formalizer 的 S2 阶段编排者。协调七个子阶段的三次精化循环，逐步收敛为完备的需求集合和架构层次。

## 子阶段流程

```
S2.1 R1 显式提取     ──→ 2_extract/r1-explicit/
S2.2 架构分解-1      ──→ 2_extract/architecture/arch-1.jsonl
S2.3 R2 隐式推导     ──→ 2_extract/r2-implicit/
S2.4 架构精化-2      ──→ 2_extract/architecture/arch-2.jsonl
S2.5 R3 关系推导-1   ──→ 2_extract/r3-relational/
S2.6 架构精化-3      ──→ 2_extract/architecture/arch-3.jsonl
S2.7 R3 关系推导-2   ──→ 2_extract/r3-relational/ (最终)
```

## 执行流程

### S2.1：R1 显式需求提取（逐行交互式，推荐）
对每个分片使用 guided-extract 进行逐行交互式提取：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts guided-extract --template prompts/executor-R1.md --shard-id <shard_id> --workdir .srs_formalizer
```
编排者启动交互循环：发送 guided_prompt → LLM 逐行输出 JSON → processLine 校验 → OK 则继续 / ERR 则反馈重试 / DONE 结束。
输出写入 `2_extract/r1-explicit/<shard_id>.jsonl`。
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-jsonl --file <path> --workdir .srs_formalizer
```
备选（一次性注入）：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/executor-R1.md --shard-id <shard_id> --workdir .srs_formalizer
```

### S2.2：初步架构分解
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/executor-arch-1.md → 分派 LLM 子代理
```
从 R1 需求中识别 Module/Actor/Constraint 层次。
输出写入 `2_extract/architecture/arch-1.jsonl`。
```bash
# 校验者审核
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/verifier-arch.md → 新会话 LLM 子代理
# 构建架构节点到图谱
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-architecture --workdir .srs_formalizer
```

### S2.3：R2 隐式需求推导
基于 R1 + **架构（Arch-1）**，对每个分片（推荐逐行提取）：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts guided-extract --template prompts/executor-R2.md --shard-id <shard_id> --type r2 --workdir .srs_formalizer
```
备选一次性注入：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/executor-R2.md --shard-id <shard_id> --workdir .srs_formalizer
```
输出写入 `2_extract/r2-implicit/<shard_id>.jsonl`。
校验循环：verifier-R2 → REJECTED → ≤3 次重试。

### S2.4：架构精化（基于 R2 + Arch-1）
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/executor-arch-2.md \
  --params '{"ARCH_1":"<arch-1内容>","R1_R2_OUTPUT":"<全部R1+R2>"}'
→ 分派 LLM 子代理
```
从 R2 隐式需求中发现遗漏模块/约束/层次修正。
输出写入 `2_extract/architecture/arch-2.jsonl`。
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-architecture --workdir .srs_formalizer  # 重新构建含增量
```

### S2.5：R3 关系推导-1
基于 R1 + R2 + **架构（Arch-2）**（推荐逐行提取）：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts guided-extract --template prompts/executor-R3.md --shard-id <shard_id> --type r3 --workdir .srs_formalizer
```
备选一次性注入：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/executor-R3.md \
  --params '{"ARCHITECTURE":"<arch-2.jsonl内容>","ALL_REQUIREMENTS":"<全部R1+R2>"}'
```
输出写入 `2_extract/r3-relational/<shard_id>.jsonl`。
校验循环：verifier-R3。

### S2.6：架构终核（基于 R3-1 + Arch-2）
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/executor-arch-3.md \
  --params '{"ARCH_2":"<arch-2内容>","R3_OUTPUT":"<R3-1全部记录>"}'
→ 分派 LLM 子代理
```
基于 R3 初步关系发现结构矛盾，输出最终修正。
输出写入 `2_extract/architecture/arch-3.jsonl`。
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-architecture --workdir .srs_formalizer  # 终核修正
```

### S2.7：R3 关系推导-2（完备架构下的最终关系）
在**完整架构（Arch-3）**约束下重新推导：
```bash
# 关键：将 Arch-3 作为 ARCHITECTURE 参数传入
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt --template prompts/executor-R3.md \
  --params '{"ARCHITECTURE":"<arch-3.jsonl内容>","ALL_REQUIREMENTS":"<全部R1+R2>"}'
→ 分派 LLM 子代理
```
输出覆盖 `2_extract/r3-relational/<shard_id>.jsonl`。

### 最终验证
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts verify-gate --workdir .srs_formalizer --stage R3
```
确认全部 JSONL 文件存在、ID 唯一、图谱可加载。

## 约束
- 校验者在新会话中执行（上下文隔离）
- 子代理 ID ASCII-only，validate-jsonl 拒绝中文
- 架构层次 ≤4 层，CONTAINS 有向无环
- 编排者只做流程决策，不自行提取/推导
