import type { NFRCategory } from '../../types/srs-ir.js';

export const NFR_KEYWORDS: Record<NFRCategory, { zh: string[]; en: string[] }> = {
  performance: {
    zh: ['响应时间', '延迟', '吞吐', '并发', '性能', 'QPS', 'TPS', '耗时', '加载'],
    en: ['latency', 'throughput', 'response time', 'concurrent', 'performance', 'qps', 'tps'],
  },
  security: {
    zh: ['安全', '加密', '认证', '授权', '防攻击', '审计', '脱敏', '权限', '鉴权'],
    en: ['encrypt', 'authentication', 'authorize', 'prevent', 'audit', 'security', 'permission', 'auth'],
  },
  availability: {
    zh: ['可用性', '容错', '冗余', '恢复', '高可用', '故障', '宕机', '灾备', 'SLA'],
    en: ['uptime', 'availability', 'fault', 'recovery', 'redundant', 'failover', 'SLA', 'disaster'],
  },
  compatibility: {
    zh: ['兼容', '适配', '浏览器', '操作系统', '平台', '跨平台', '版本'],
    en: ['compatible', 'browser', 'platform', 'cross-platform', 'version', 'OS'],
  },
  maintainability: {
    zh: ['可维护', '扩展', '模块化', '可配置', '热更新', '热部署', '灰度', '可观测'],
    en: ['maintainable', 'extensible', 'modular', 'configurable', 'observability', 'logging', 'monitoring'],
  },
  compliance: {
    zh: ['合规', 'GDPR', '审计', '监管', '等级保护', '等保', 'PCI', '数据安全法'],
    en: ['compliance', 'GDPR', 'PCI', 'audit', 'regulatory', 'data protection'],
  },
};

export function detectNFRCategories(text: string, lang: 'zh' | 'en'): NFRCategory[] {
  if (!text || text.trim().length === 0) return [];
  const lower = text.toLowerCase();
  const results: NFRCategory[] = [];
  for (const [category, keywords] of Object.entries(NFR_KEYWORDS)) {
    const kw = keywords[lang] ?? [];
    for (const k of kw) {
      if (lower.includes(k.toLowerCase())) {
        results.push(category as NFRCategory);
        break;
      }
    }
  }
  return results;
}

export function computeNFRWeight(text: string, lang: 'zh' | 'en'): number {
  if (!text || text.trim().length === 0) return 0;
  const lower = text.toLowerCase();
  let totalHits = 0;
  const maxHits = 30;
  for (const [, keywords] of Object.entries(NFR_KEYWORDS)) {
    const kw = keywords[lang] ?? [];
    for (const k of kw) {
      let idx = lower.indexOf(k.toLowerCase());
      while (idx !== -1) {
        totalHits++;
        idx = lower.indexOf(k.toLowerCase(), idx + 1);
      }
    }
  }
  return Math.min(totalHits / maxHits, 1.0);
}
