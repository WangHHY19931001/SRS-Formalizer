# S1 预处理 — 验收清单

- [ ] init 成功创建 `.srs_formalizer/` 及全部阶段目录
- [ ] manifest 成功生成分片文件
- [ ] `_ctx/shard_index.json` 存在且 `total_shards ≥ 1`
- [ ] `1_shard/` 下分片文件数 == `total_shards`（无遗漏）
- [ ] 每个分片头部含 `# shard_id:` `# source:` `# total_shards:`
- [ ] GAPS.md 已生成，缺口已标注优先级
- [ ] CONTEXT.md 含术语表和切片索引
- [ ] STATE.md 当前阶段标记为 S1 完成
