import * as fs from 'node:fs';
import * as path from 'node:path';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';

function scanBddScenarios(workdir: string): Map<string, string[]> {
  const bddMap = new Map<string, string[]>();
  const bddDir = artifactPath(workdir, ARTIFACT_PATHS.bddVerified);
  if (!fs.existsSync(bddDir)) return bddMap;

  for (const f of fs.readdirSync(bddDir).filter(fn => fn.endsWith('.feature'))) {
    const content = fs.readFileSync(path.join(bddDir, f), 'utf-8');
    const scenarioRe = /^\s*Scenario(?:\s+Outline)?:\s*(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = scenarioRe.exec(content)) !== null) {
      if (!m[1]) continue;
      const header = m[1].trim();
      const idMatch = header.match(/^([\w-]+):/);
      if (idMatch?.[1]) {
        const reqId = idMatch[1];
        if (!bddMap.has(reqId)) bddMap.set(reqId, []);
        bddMap.get(reqId)!.push(`${f}:${m.index + 1}`);
      }
    }
  }
  return bddMap;
}

function scanTlaInvariants(workdir: string): Map<string, string[]> {
  const tlaMap = new Map<string, string[]>();
  const tlaDir = artifactPath(workdir, ARTIFACT_PATHS.tlaVerified);
  if (!fs.existsSync(tlaDir)) return tlaMap;

  for (const f of fs.readdirSync(tlaDir).filter(fn => fn.endsWith('.tla'))) {
    const content = fs.readFileSync(path.join(tlaDir, f), 'utf-8');
    const invRe = /^(\w*(?:Inv|TypeOK|Safety|Liveness)\w*)\s*==/gm;
    let m: RegExpExecArray | null;
    while ((m = invRe.exec(content)) !== null) {
      if (!m[1] || m[1] === 'Init' || m[1] === 'Next') continue;
      if (!tlaMap.has('_all')) tlaMap.set('_all', []);
      tlaMap.get('_all')!.push(`${f}:${m[1]}`);
    }
  }
  return tlaMap;
}

function scanLeanTheorems(workdir: string): Map<string, string[]> {
  const leanMap = new Map<string, string[]>();
  const leanDir = artifactPath(workdir, ARTIFACT_PATHS.leanVerified);
  if (!fs.existsSync(leanDir)) return leanMap;

  for (const f of fs.readdirSync(leanDir).filter(fn => fn.endsWith('.lean'))) {
    const content = fs.readFileSync(path.join(leanDir, f), 'utf-8');
    const thmRe = /^theorem\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = thmRe.exec(content)) !== null) {
      if (!m[1]) continue;
      if (!leanMap.has('_all')) leanMap.set('_all', []);
      leanMap.get('_all')!.push(`${f}:${m[1]}`);
    }
  }
  return leanMap;
}

function scanFixtureFiles(workdir: string): Map<string, string[]> {
  const fixtureMap = new Map<string, string[]>();
  const fixtureDir = artifactPath(workdir, ARTIFACT_PATHS.fixtures);
  if (!fs.existsSync(fixtureDir)) return fixtureMap;

  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + entry.name + '/');
      } else {
        const key = '_all';
        if (!fixtureMap.has(key)) fixtureMap.set(key, []);
        fixtureMap.get(key)!.push(prefix + entry.name);
      }
    }
  };
  walk(fixtureDir, '');
  return fixtureMap;
}

function resolveBdd(reqId: string, bddMap: Map<string, string[]>): string {
  const scenarios = bddMap.get(reqId);
  if (!scenarios || scenarios.length === 0) return '-';
  return scenarios[0]!;
}

function resolveTla(_reqId: string, tlaMap: Map<string, string[]>): string {
  const all = tlaMap.get('_all');
  if (!all || all.length === 0) return '-';
  return all[0]!;
}

function resolveLean(_reqId: string, leanMap: Map<string, string[]>): string {
  const all = leanMap.get('_all');
  if (!all || all.length === 0) return '-';
  return all[0]!;
}

function resolveFixture(_reqId: string, fixtureMap: Map<string, string[]>): string {
  const all = fixtureMap.get('_all');
  if (!all || all.length === 0) return '-';
  return all[0]!;
}

export {
  scanBddScenarios,
  scanTlaInvariants,
  scanLeanTheorems,
  scanFixtureFiles,
  resolveBdd,
  resolveTla,
  resolveLean,
  resolveFixture,
};
