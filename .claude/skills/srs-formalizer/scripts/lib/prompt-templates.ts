/**
 * Sub-agent prompt template generators for graph analysis reviews.
 */

export function generateDuplicateAnalysisMd(
  pairs: { pairId: string; nodeA: string; nodeB: string; similarity: number; statementA: string; statementB: string }[]
): string {
  const lines: string[] = [];
  lines.push('# 疑似重复需求分析');
  lines.push('');
  lines.push('以下需求对经 Jaccard 相似度分析（阈值 > 0.7）标记为疑似重复，请子代理逐条审查并给出判决。');
  lines.push('');
  lines.push('| PairID | 节点A | 节点B | Jaccard | 语句A | 语句B |');
  lines.push('|--------|-------|-------|---------|-------|-------|');

  for (const p of pairs) {
    const sA = p.statementA.length > 50 ? p.statementA.slice(0, 47) + '...' : p.statementA;
    const sB = p.statementB.length > 50 ? p.statementB.slice(0, 47) + '...' : p.statementB;
    lines.push(`| ${p.pairId} | ${p.nodeA} | ${p.nodeB} | ${p.similarity.toFixed(3)} | ${sA} | ${sB} |`);
  }

  lines.push('', '## 判决格式', '', '每条请输出一行 JSONL：', '```jsonl');
  lines.push('{"pair_id":"DUP-001","verdict":"duplicate|not_duplicate","reasoning":"...","recommended_action":"merge|skip"}');
  lines.push('```', '');
  return lines.join('\n');
}

export function generateConflictAnalysisMd(
  pairs: { pairId: string; nodeA: string; nodeB: string; similarity: number; statementA: string; statementB: string; negationInA: boolean; negationInB: boolean }[]
): string {
  const lines: string[] = [];
  lines.push('# 疑似语义冲突分析');
  lines.push('');
  lines.push('以下需求对经反义检测标记为疑似冲突，请子代理逐条审查并给出判决。');
  lines.push('');
  lines.push('| PairID | 节点A | 节点B | 相似度 | A含否定 | B含否定 | 语句A | 语句B |');
  lines.push('|--------|-------|-------|--------|---------|---------|-------|-------|');

  for (const p of pairs) {
    const sA = p.statementA.length > 40 ? p.statementA.slice(0, 37) + '...' : p.statementA;
    const sB = p.statementB.length > 40 ? p.statementB.slice(0, 37) + '...' : p.statementB;
    lines.push(`| ${p.pairId} | ${p.nodeA} | ${p.nodeB} | ${p.similarity.toFixed(3)} | ${p.negationInA ? '是' : '否'} | ${p.negationInB ? '是' : '否'} | ${sA} | ${sB} |`);
  }

  lines.push('', '## 判决格式', '', '每条请输出一行 JSONL：', '```jsonl');
  lines.push('{"pair_id":"CON-001","verdict":"conflict|not_conflict","reasoning":"...","recommended_action":"add_conflict_edge|skip"}');
  lines.push('```', '');
  return lines.join('\n');
}

export function generateAspectAnalysisMd(
  clusters: { clusterId: string; object: string; nodes: string[]; statements: string[] }[]
): string {
  const lines: string[] = [];
  lines.push('# 同对象多侧面分析');
  lines.push('');
  lines.push('以下集群共享同一概念对象但描述不同侧面，请子代理逐条审查并给出判决。');
  lines.push('');
  lines.push('| ClusterID | 对象 | 节点数 | 节点列表 | 语句摘要 |');
  lines.push('|-----------|------|--------|----------|----------|');

  for (const c of clusters) {
    const nodeListStr = c.nodes.join(', ');
    const stmtSummary = c.statements.map(s => s.length > 30 ? s.slice(0, 27) + '...' : s).join('; ');
    lines.push(`| ${c.clusterId} | ${c.object} | ${c.nodes.length} | ${nodeListStr} | ${stmtSummary} |`);
  }

  lines.push('', '## 判决格式', '', '每条请输出一行 JSONL：', '```jsonl');
  lines.push('{"pair_id":"ASP-001","verdict":"same_aspect|not_same_aspect","reasoning":"...","recommended_action":"add_same_aspect_edge|skip"}');
  lines.push('```', '');
  return lines.join('\n');
}
