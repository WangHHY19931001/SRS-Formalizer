# S1 预处理 — 验收清单

- [ ] Bootstrap 成功创建 `.srs_formalizer/` 及全部阶段目录（Agent 手动创建工作目录，SKILL.md §Bootstrap）
- [ ] manifest 成功生成索引化分片
- [ ] `_ctx/shard_index.json` 存在且 `total_shards ≥ 1`
- [ ] 每个 shard 含 `locator`（`{file_abspath}-{start}-{end}-{chunk_id}`）
- [ ] 每个 shard 的 `source_path` 指向的源文件存在
- [ ] GAPS.md 已生成，缺口已标注优先级
- [ ] CONTEXT.md 含术语表和切片索引
- [ ] STATE.md 当前阶段标记为 S1 完成
