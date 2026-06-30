# S3 图谱构建 — 验收清单

- [ ] build-graph 成功：节点数 ≥ R1 显式需求数
- [ ] build-architecture 成功：Module/Actor/Constraint 节点存在
- [ ] analyze-structure 完成：orphan/dangling/island 报告已生成
- [ ] merge-structure 完成：补全建议已应用
- [ ] analyze-graph 完成：duplicate/conflict/cluster 报告已生成
- [ ] merge-analysis 完成：语义判定已合并
- [ ] export-cypher 成功：`6_outputs/knowledge_graph/schema.cypher` 非空
- [ ] validate-cypher PASS
- [ ] verify-gate --stage R3 PASS
- [ ] 图边完整性：每条边的 source/target 节点存在
