import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildTraceabilityMatrix } from '../../lib/fixture-gen/traceability.js';

describe('buildTraceabilityMatrix', () => {
  it('builds matrix from SRS records', () => {
    const records = [
      {
        id: 'REQ-001',
        title: 'Login functionality',
        description: 'User can login with credentials',
        priority: 'high',
        type: 'functional',
      },
      {
        id: 'REQ-002',
        title: 'Dashboard view',
        description: 'User can view dashboard',
        priority: 'medium',
        type: 'functional',
      },
    ];

    const matrix = buildTraceabilityMatrix(records);
    assert.equal(matrix.length, 2);
    assert.equal(matrix[0]?.requirementId, 'REQ-001');
    assert.equal(matrix[0]?.requirementTitle, 'Login functionality');
    assert.equal(matrix[0]?.coverageStatus, 'none');
  });

  it('marks partial coverage when some fields populated', () => {
    const records = [
      {
        id: 'REQ-001',
        title: 'Login',
        description: 'User login',
        priority: 'high',
        type: 'functional',
      },
    ];

    const partialData = {
      'REQ-001': {
        graphNodes: ['LoginNode'],
        bddScenarios: [] as string[],
        tlaInvariants: [] as string[],
        leanTheorems: [] as string[],
        fixtureFiles: [] as string[],
      },
    };

    const matrix = buildTraceabilityMatrix(records, partialData);
    assert.equal(matrix[0]?.coverageStatus, 'partial');
    assert.deepEqual(matrix[0]?.graphNodes, ['LoginNode']);
  });

  it('marks full coverage when all fields populated', () => {
    const records = [
      {
        id: 'REQ-001',
        title: 'Login',
        description: 'User login',
        priority: 'high',
        type: 'functional',
      },
    ];

    const fullData = {
      'REQ-001': {
        graphNodes: ['LoginNode'],
        bddScenarios: ['Scenario: Login'],
        tlaInvariants: ['TypeOK'],
        leanTheorems: ['theorem login_works'],
        fixtureFiles: ['login.feature'],
      },
    };

    const matrix = buildTraceabilityMatrix(records, fullData);
    assert.equal(matrix[0]?.coverageStatus, 'full');
  });

  it('handles empty records', () => {
    const matrix = buildTraceabilityMatrix([]);
    assert.equal(matrix.length, 0);
  });
});
