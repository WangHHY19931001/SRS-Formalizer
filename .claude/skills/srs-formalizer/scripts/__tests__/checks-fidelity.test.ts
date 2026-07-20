import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkFidelityReport, checkSafetyCriticalCoverage } from '../lib/verify-gate/checks-fidelity.js';

function setup(): string {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-fidelity-gate-'));
  fs.mkdirSync(path.join(workdir, 'outputs', 'reports'), { recursive: true });
  return workdir;
}

function writeIr(workdir: string, nodes: unknown[]): void {
  fs.writeFileSync(path.join(workdir, 'srs-ir.json'), JSON.stringify({
    version: '2.0.0', meta: {}, nodes, edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
  }));
}

function writeReport(workdir: string, findings: unknown[]): void {
  const errors = (findings as { severity: string }[]).filter(f => f.severity === 'error').length;
  fs.writeFileSync(path.join(workdir, 'outputs', 'reports', 'fidelity.json'), JSON.stringify({ generatedAt: 't', findings, summary: { errors, warnings: 0, passed: errors === 0 } }));
}

describe('checkFidelityReport', () => {
  it('fails when the report is missing', () => {
    const workdir = setup();
    assert.equal(checkFidelityReport(workdir).passed, false);
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('passes with a clean report', () => {
    const workdir = setup();
    writeReport(workdir, []);
    assert.equal(checkFidelityReport(workdir).passed, true);
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('fails with an error-severity finding', () => {
    const workdir = setup();
    writeReport(workdir, [{ layer: 'req->bdd', kind: 'coverage-gap', severity: 'error', subject: 'R1-S001-1', detail: '' }]);
    assert.equal(checkFidelityReport(workdir).passed, false);
    fs.rmSync(workdir, { recursive: true, force: true });
  });
});

describe('checkSafetyCriticalCoverage', () => {
  it('passes when no safety-critical requirements exist', () => {
    const workdir = setup();
    writeIr(workdir, [{ id: 'R1-S001-1', type: 'requirement', properties: {} }]);
    assert.equal(checkSafetyCriticalCoverage(workdir).passed, true);
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('fails when a safety-critical requirement has a coverage error', () => {
    const workdir = setup();
    writeIr(workdir, [{ id: 'R1-S001-1', type: 'requirement', properties: { formalizationPriority: 'safety-critical' } }]);
    writeReport(workdir, [{ layer: 'req->bdd', kind: 'coverage-gap', severity: 'error', subject: 'R1-S001-1', detail: '' }]);
    assert.equal(checkSafetyCriticalCoverage(workdir).passed, false);
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('passes when safety-critical requirements are covered', () => {
    const workdir = setup();
    writeIr(workdir, [{ id: 'R1-S001-1', type: 'requirement', properties: { formalizationPriority: 'safety-critical' } }]);
    writeReport(workdir, []);
    assert.equal(checkSafetyCriticalCoverage(workdir).passed, true);
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('fails closed when safety-critical declared but no report exists', () => {
    const workdir = setup();
    writeIr(workdir, [{ id: 'R1-S001-1', type: 'requirement', properties: { formalizationPriority: 'safety-critical' } }]);
    assert.equal(checkSafetyCriticalCoverage(workdir).passed, false);
    fs.rmSync(workdir, { recursive: true, force: true });
  });
});
