import type { SRSIR, NFRCategory } from '../../types/srs-ir.js';
import { detectNFRCategories } from '../frontend/nfr-keywords.js';
import { extractThreshold } from './nfr-thresholds.js';

export interface NFRTagResult {
  ir: SRSIR;
  tagged: number;
  thresholdsFound: number;
}

export function tagNFR(ir: SRSIR): NFRTagResult {
  let tagged = 0;
  let thresholdsFound = 0;
  const allCategories: NFRCategory[] = ['performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance'];
  const categoryHits = new Map<NFRCategory, number>();

  for (const node of ir.nodes) {
    if (node.type !== 'requirement') continue;
    const stmt = node.properties.statement ?? '';
    const cats = detectNFRCategories(stmt, ir.meta.language);
    if (cats.length === 0) continue;

    node.type = 'nfr';
    for (const c of cats) {
      const label = `:NFR${c.charAt(0).toUpperCase() + c.slice(1)}` as const;
      if (!node.labels.includes(label)) {
        node.labels.push(label);
      }
      categoryHits.set(c, (categoryHits.get(c) ?? 0) + 1);
    }
    const primaryCat = cats[0];
    if (!primaryCat) continue;
    node.properties.nfrCategory = primaryCat;

    const threshold = extractThreshold(stmt, primaryCat);
    if (threshold) {
      node.properties.nfrThreshold = threshold;
      thresholdsFound++;
    }
    tagged++;
  }

  const detected = [];
  for (const cat of allCategories) {
    const hits = categoryHits.get(cat);
    if (hits !== undefined && hits > 0) {
      detected.push({
        category: cat,
        keywordHits: hits,
        shardIds: [],
        nodeIds: ir.nodes.filter(n => n.properties.nfrCategory === cat).map(n => n.id),
      });
    }
  }
  ir.nfrProfile.detectedCategories = detected;
  ir.nfrProfile.overallCoverage = detected.length / allCategories.length;
  ir.nfrProfile.blindSpots = allCategories.filter(c => !categoryHits.has(c));

  return { ir, tagged, thresholdsFound };
}
