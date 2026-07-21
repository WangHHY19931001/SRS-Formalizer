import type { SRSIR, NFRCategory, NFREntry, NFRWeightedShard } from '../../types/srs-ir.js';

const NFR_KEYWORDS: Record<NFRCategory, RegExp[]> = {
  performance: [/性能|latency|throughput|响应时间|吞吐量|并发/i, /\b\d+\s*(ms|s|rps|qps)\b/i],
  security: [/安全|认证|授权|加密|权限|security|auth|encrypt/i],
  availability: [/可用性|容错|恢复|故障|availability|redundan/i],
  compatibility: [/兼容|适配|浏览器|设备|compat/i],
  maintainability: [/可维护|模块化|扩展|maintain|extens/i],
  compliance: [/合规|审计|法规|GDPR|compliance|audit/i],
};

export function tagNFR(ir: SRSIR): SRSIR {
  const entries: NFREntry[] = [];
  const weightedShards: NFRWeightedShard[] = [];
  // 注意：NFR 关键词不应包含 "必须"（根因报告 §4.7 注水根因）
  const reqNodes = ir.nodes.filter(n => n.type === 'requirement');
  for (const category of Object.keys(NFR_KEYWORDS) as NFRCategory[]) {
    const patterns = NFR_KEYWORDS[category];
    const matchedNodes = reqNodes.filter(n =>
      patterns.some(p => p.test(n.properties.statement ?? ''))
    );
    if (matchedNodes.length === 0) continue;
    const shardIds = [...new Set(matchedNodes.map(n => n.source.shardId))];
    const keywordHits = matchedNodes.reduce(
      (count, n) => count + patterns.reduce((c, p) => c + (p.test(n.properties.statement ?? '') ? 1 : 0), 0),
      0
    );
    entries.push({
      category,
      keywordHits,
      shardIds,
      nodeIds: matchedNodes.map(n => n.id),
    });
  }
  // 计算覆盖率
  const totalReqs = reqNodes.length;
  const taggedReqs = new Set(entries.flatMap(e => e.nodeIds)).size;
  const overallCoverage = totalReqs > 0 ? taggedReqs / totalReqs : 0;

  return {
    ...ir,
    nfrProfile: {
      detectedCategories: entries,
      weightedShards,
      overallCoverage,
      blindSpots: (Object.keys(NFR_KEYWORDS) as NFRCategory[]).filter(
        c => !entries.some(e => e.category === c)
      ),
    },
  };
}
