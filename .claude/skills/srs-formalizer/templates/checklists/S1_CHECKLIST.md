# S1 预处理 — 验收清单

- [ ] Bootstrap 成功创建 `.srs_formalizer/` 及全部阶段目录（Agent 手动创建工作目录，SKILL.md §Bootstrap）
- [ ] _ctx/confirmation.json 存在且 user_confirm=true（Inversion 模式机械触发器）
- [ ] F1 分片产出 _ctx/shard_index.json，validate-shard-index PASS
- [ ] 每个 shard 含 locator（`{file_abspath}-{start}-{end}-{chunk_id}`）
- [ ] 每个 shard 的 source_path 指向的源文件存在
- [ ] GAPS.md 已生成（非 .template 未填充），缺口已标注优先级
- [ ] STATE.md 当前阶段标记为 S1 完成，且引用 _ctx/gate-S1.json receiptHash
