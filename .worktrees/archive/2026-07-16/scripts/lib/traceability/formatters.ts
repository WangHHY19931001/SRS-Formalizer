import type { MatrixRow } from './types.js';
import { sanitizeId } from '../id-utils.js';

function formatMarkdownTable(rows: MatrixRow[]): string {
  const lines: string[] = [
    '# V-Model Traceability Matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| 需求ID | 模块 | Cypher | BDD | TLA+ | Lean | Fixture |',
    '|--------|------|--------|-----|------|------|---------|',
  ];

  for (const r of rows) {
    const cypher = r.cypher === '-' ? '-' : ':white_check_mark:';
    lines.push(`| ${r.reqId} | ${r.module} | ${cypher} | ${r.bdd} | ${r.tla} | ${r.lean} | ${r.fixture} |`);
  }

  return lines.join('\n');
}

function formatCypherMatrix(rows: MatrixRow[]): string {
  const lines: string[] = [
    '// V-Model Traceability Matrix — Cypher Export',
    `// Requirements: ${rows.length}`,
    `// Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const r of rows) {
    const sid = sanitizeId(r.reqId);
    lines.push(`// Requirement: ${r.reqId}`);

    if (r.cypher !== '-') {
      const cypherSan = sanitizeId(r.cypher);
      lines.push(`CREATE (${sid})-[:TRACES_TO]->(${cypherSan});`);
    }

    if (r.bdd !== '-' && r.bdd !== 'N/A') {
      const [featFile] = r.bdd.split(':');
      const bddSan = sanitizeId(featFile ?? 'unknown');
      lines.push(`CREATE (${sid})-[:VERIFIED_BY_BDD]->(${bddSan}:BDDFeature {file: "${featFile}"});`);
    }

    if (r.tla !== '-' && r.tla !== 'N/A') {
      const [tlaFile, inv] = r.tla.split(':');
      const tlaSan = sanitizeId(inv ?? tlaFile ?? 'unknown');
      lines.push(`CREATE (${sid})-[:VERIFIED_BY_TLA]->(${tlaSan}:TLAInvariant {spec: "${tlaFile}"});`);
    }

    if (r.lean !== '-' && r.lean !== 'N/A') {
      const [leanFile, thm] = r.lean.split(':');
      const leanSan = sanitizeId(thm ?? leanFile ?? 'unknown');
      lines.push(`CREATE (${sid})-[:VERIFIED_BY_LEAN]->(${leanSan}:LeanTheorem {file: "${leanFile}"});`);
    }

    if (r.fixture !== '-' && r.fixture !== 'N/A') {
      const fixtureSan = sanitizeId(r.fixture.replace(/\//g, '_').replace(/\.\w+$/, ''));
      lines.push(`CREATE (${sid})-[:TESTED_BY]->(${fixtureSan}:TestFixture {path: "${r.fixture}"});`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

export { formatMarkdownTable, formatCypherMatrix };
