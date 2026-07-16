/**
 * Architecture JSONL validator — validates arch-1/arch-2/arch-3 records.
 *
 * Extracted from commands/validate-architecture.ts.
 */

const ARCH1_TYPES = new Set(['module', 'actor', 'constraint']);
const ARCH2_ACTIONS = new Set(['add_module', 'add_constraint', 'add_actor', 'reparent', 'merge']);
const ARCH3_ACTIONS = new Set(['add_dependency_layer']);
const ARCH1_ID_RE = /^ARCH-[A-Za-z0-9_.]+-\d{4}$/;
const ARCH2_ID_RE = /^ARCH2-[A-Za-z0-9_.]+-\d{4}$/;
const ARCH3_ID_RE = /^ARCH3-[A-Za-z0-9_.]+-\d{4}$/;
const CONTAINS_ID_RE = /^R[12]-[A-Za-z0-9_.]+-\d{4}$/;
const ASCII_ONLY_RE = /^[\x00-\x7F]*$/;
const MIN_REASONING_LENGTH = 10;

export interface ArchRecord {
  id: unknown;
  type?: unknown;
  action?: unknown;
  name?: unknown;
  parent?: unknown;
  contains?: unknown;
  reasoning?: unknown;
}

function isString(v: unknown): v is string { return typeof v === 'string'; }
function isArray(v: unknown): v is unknown[] { return Array.isArray(v); }

export function detectArchLevel(record: ArchRecord): 1 | 2 | 3 | null {
  if (typeof record.id === 'string') {
    if (record.id.startsWith('ARCH2-')) return 2;
    if (record.id.startsWith('ARCH3-')) return 3;
    if (record.id.startsWith('ARCH-')) return 1;
  }
  return null;
}

export function validateRecord(record: ArchRecord, index: number): string[] {
  const errors: string[] = [];
  const prefix = `record[${index}]`;
  const archLevel = detectArchLevel(record);

  if (archLevel === 1) {
    if (!isString(record.type) || !ARCH1_TYPES.has(record.type)) {
      errors.push(`${prefix}: type must be one of "module", "actor", or "constraint" for arch-1 record, got "${String(record.type)}"`);
    }
  } else if (archLevel === 2) {
    if (!isString(record.action) || !ARCH2_ACTIONS.has(record.action)) {
      errors.push(`${prefix}: action must be one of ${[...ARCH2_ACTIONS].join(', ')} for arch-2 record, got "${String(record.action)}"`);
    }
  } else if (archLevel === 3) {
    if (!isString(record.action) || !ARCH3_ACTIONS.has(record.action)) {
      errors.push(`${prefix}: action must be one of ${[...ARCH3_ACTIONS].join(', ')} for arch-3 record, got "${String(record.action)}"`);
    }
  } else {
    errors.push(`${prefix}: unable to determine arch level from id "${String(record.id)}"`);
  }

  // Check 2: id format
  if (!isString(record.id)) {
    errors.push(`${prefix}: id must be a string`);
  } else {
    let idValid = false;
    if (record.id.startsWith('ARCH3-')) idValid = ARCH3_ID_RE.test(record.id);
    else if (record.id.startsWith('ARCH2-')) idValid = ARCH2_ID_RE.test(record.id);
    else if (record.id.startsWith('ARCH-')) idValid = ARCH1_ID_RE.test(record.id);

    if (!idValid) errors.push(`${prefix}: invalid id format "${record.id}"`);
    if (!ASCII_ONLY_RE.test(record.id)) errors.push(`${prefix}: id "${record.id}" contains non-ASCII characters`);
  }

  // Check 3: contains references
  if (record.contains !== undefined && record.contains !== null) {
    if (!isArray(record.contains)) {
      errors.push(`${prefix}: contains must be an array`);
    } else {
      for (let ci = 0; ci < record.contains.length; ci++) {
        const ref = record.contains[ci];
        if (!isString(ref)) errors.push(`${prefix}: contains[${ci}] must be a string`);
        else if (!CONTAINS_ID_RE.test(ref)) errors.push(`${prefix}: contains[${ci}] "${ref}" does not match required format R[12]-XXX-NNNN`);
      }
    }
  }

  // Check 6: reasoning
  if (!isString(record.reasoning) || record.reasoning.trim().length < MIN_REASONING_LENGTH) {
    errors.push(`${prefix}: reasoning must be a string with at least ${MIN_REASONING_LENGTH} characters`);
  }

  return errors;
}

export function crossRecordChecks(records: ArchRecord[]): string[] {
  const errors: string[] = [];
  const moduleNames = new Set<string>();
  const moduleIds = new Set<string>();

  for (const rec of records) {
    if (isString(rec.name) && rec.name.length > 0) moduleNames.add(rec.name);
    if (isString(rec.id)) moduleIds.add(rec.id);
  }

  // Check 4: parent resolution
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const prefix = `record[${i}]`;
    if (rec.parent !== undefined && rec.parent !== null) {
      if (!isString(rec.parent)) errors.push(`${prefix}: parent must be a string or null`);
      else if (!moduleNames.has(rec.parent)) errors.push(`${prefix}: parent "${rec.parent}" not found in any record's name field`);
    }
  }

  // Check 5: cycle detection in CONTAINS relationships
  const adjacency = new Map<string, string[]>();
  for (const rec of records) {
    if (isString(rec.id) && isArray(rec.contains)) {
      const containsRefs = rec.contains.filter(isString);
      if (containsRefs.length > 0) adjacency.set(rec.id, containsRefs);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): string | null {
    if (inStack.has(nodeId)) return nodeId;
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    inStack.add(nodeId);
    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (moduleIds.has(neighbor)) {
          const cycleNode = dfs(neighbor);
          if (cycleNode !== null) return cycleNode;
        }
      }
    }
    inStack.delete(nodeId);
    return null;
  }

  for (const nodeId of adjacency.keys()) {
    if (!visited.has(nodeId)) {
      const cyclePoint = dfs(nodeId);
      if (cyclePoint !== null) errors.push(`cycle detected: module "${cyclePoint}" contains itself (directly or indirectly)`);
    }
  }

  return errors;
}
