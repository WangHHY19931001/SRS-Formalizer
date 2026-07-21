# S3 图谱构建 — 验收清单

- [ ] assemble-ir 成功：节点数 ≥ R1 显式需求数（自动生成 graph.merged.json）
- [ ] Agent 手动构建 + validate-architecture PASS：Module/Actor/Constraint 节点存在
- [ ] query-graph 完成：orphan/dangling/island 报告已生成（M1 Structure Analyzer）
- [ ] M5 Merge Optimizer 完成：补全建议已应用
- [ ] analyze-graph 完成：duplicate/conflict/cluster 报告已生成
- [ ] merge-analysis 完成：语义判定已合并
- [ ] Agent 按 executor-backend-cypher.md 生成：`outputs/graphs/srs-graph.cypher` 非空
- [ ] validate-cypher PASS
- [ ] verify-gate --stage R3 PASS
- [ ] 图边完整性：每条边的 source/target 节点存在
