/**
 * scorer/hierarchical.ts — Scoring for hierarchical_reasoning dimension
 */

import type { ProbeItem, ProbeResult } from '../types.js';
import { extractJson } from './helpers.js';

export function scoreHierarchicalReasoning(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let assignments: Array<{ requirement: string; module: string }> = [];

  if (Array.isArray(parsed)) {
    assignments = parsed as Array<{ requirement: string; module: string }>;
  }

  if (assignments.length === 0) {
    details.push('accuracy_80pct: 无法解析归类结果');
    return { probe_id: probe.probe_id, dimension: 'hierarchical_reasoning', score: 0, details, passed: false };
  }

  // Map each assignment to expected module by FR-ID
  const hierarchyExpected = probe.expected.hierarchy_expected;
  const hasExpected = hierarchyExpected && Object.keys(hierarchyExpected).length > 0;

  if (hasExpected) {
    // Use existing FR-ID matching logic when hierarchy_expected is non-empty
    let correctCount = 0;
    for (const a of assignments) {
      const req = String(a.requirement ?? '');
      const module = String(a.module ?? '');

      // Extract FR-ID from requirement string
      const frMatch = req.match(/(FR-\d{3})/);
      if (frMatch) {
        const frId = frMatch[1]!;
        const expected = hierarchyExpected[frId];
        if (expected && module === expected) {
          correctCount++;
        }
      }
    }

    const pct = Math.round((correctCount / assignments.length) * 100);
    details.push(`accuracy_80pct: ${correctCount}/${assignments.length} 归类正确 (${pct}%)`);

    return {
      probe_id: probe.probe_id,
      dimension: 'hierarchical_reasoning',
      score: pct,
      details,
      passed: pct >= 80,
    };
  }

  // No pre-defined hierarchy_expected: evaluate flat-text auto-infer probe
  // Criterion 1: module count is reasonable (3-6 modules)
  const uniqueModules = new Set(assignments.map((a) => String(a.module ?? '').trim()).filter(Boolean));
  const moduleCount = uniqueModules.size;
  const moduleCountScore = moduleCount >= 3 && moduleCount <= 6 ? 50 : 0;
  details.push(`module_count: ${moduleCount} 个模块 (${moduleCount >= 3 && moduleCount <= 6 ? '合理 ✓' : '不合理'})`);

  // Criterion 2: each requirement assigned to exactly one module
  const reqCount = assignments.length;
  const reqsWithModule = assignments.filter((a) => String(a.module ?? '').trim() !== '').length;
  const oneModulePerReq = reqCount > 0 && reqsWithModule === reqCount;
  const oneModuleScore = oneModulePerReq ? 25 : 0;
  details.push(`one_module_per_req: ${reqsWithModule}/${reqCount} 条需求有模块分配 (${oneModulePerReq ? '✓' : '部分需求缺少模块'})`);

  // Criterion 3: module names are semantically meaningful (not just "模块1", "模块2", etc.)
  const genericNamePattern = /^模块\d+$/;
  const allGeneric = [...uniqueModules].every((name) => genericNamePattern.test(name));
  const meaningfulNameScore = moduleCount > 0 && !allGeneric ? 25 : 0;
  details.push(`meaningful_names: ${allGeneric ? '模块名为默认名称（如 模块1）' : '模块名有语义含义 ✓'}`);

  const autoScore = moduleCountScore + oneModuleScore + meaningfulNameScore;
  details.push(`auto_infer_total: ${autoScore}/100`);

  return {
    probe_id: probe.probe_id,
    dimension: 'hierarchical_reasoning',
    score: autoScore,
    details,
    passed: autoScore >= 70,
  };
}
