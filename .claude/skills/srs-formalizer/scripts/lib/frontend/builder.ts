import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonlRecord } from '../../types/index.js';
import type {
  SRSIR, IRNode, IREdge, IRMeta, CrossRef, NFRProfile,
  IREdgeType, IRNodeType, IRProperties, IRSource,
} from '../../types/srs-ir.js';
import { listJsonlFiles, readJsonl } from '../jsonl.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const EXTRACT_SUBDIRS = ['r1-explicit', 'r2-implicit', 'r3-relational', 'r3-cross', 'r4-nfr'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function labelForCategory(category: string): string {
  switch (category) {
    case 'explicit': return ':Requirement';
    case 'implicit': return ':ImplicitRequirement';
    case 'relational': return ':RelationalRequirement';
    default: return ':Requirement';
  }
}

function irNodeType(_category: string): IRNodeType {
  return 'requirement';
}

function toIRNode(record: JsonlRecord): IRNode {
  const properties: IRProperties = {
    statement: record.statement,
    category: record.category,
    confidence: record.confidence,
  };

  const source: IRSource = {
    filePath: record.source_file,
    startLine: 1,
    endLine: 1,
    shardId: record.id,
    chapter: '',
  };

  return {
    id: record.id,
    type: irNodeType(record.category),
    module: record.source_file,
    labels: [labelForCategory(record.category)],
    properties,
    source,
  };
}

function edgeTypeFromString(s: string): IREdgeType | null {
  const normalized = s.toLowerCase();
  const valid: readonly string[] = [
    'depends_on', 'refines', 'conflicts_with', 'derived_from',
    'same_aspect', 'contains', 'nfr_impacts', 'nfr_constrains',
    'cross_file_depends', 'verifies', 'implements', 'proves', 'traces_to',
  ];
  if (valid.includes(normalized)) return normalized as IREdgeType;
  return null;
}

function toIREdges(record: JsonlRecord): IREdge[] {
  const edges: IREdge[] = [];
  const meta = record.metadata;
  if (!isRecord(meta)) return edges;

  const relation = meta['relation'];
  if (!isRecord(relation)) return edges;

  const relType = relation['type'];
  if (typeof relType !== 'string') return edges;

  const edgeType = edgeTypeFromString(relType);
  if (!edgeType) return edges;

  const source: string =
    typeof meta['source_id'] === 'string' ? meta['source_id'] : record.id;
  const target: string | undefined =
    typeof meta['target_id'] === 'string'
      ? meta['target_id']
      : typeof relation['target'] === 'string'
        ? relation['target']
        : undefined;
  if (!target) return edges;

  edges.push({
    id: `e-${source}-${target}-${edgeType}`,
    source,
    target,
    type: edgeType,
    properties: {},
  });

  return edges;
}

function safeParseNFRProfile(raw: unknown): NFRProfile {
  const defaults: NFRProfile = {
    detectedCategories: [],
    weightedShards: [],
    overallCoverage: 0,
    blindSpots: [],
  };
  if (!isRecord(raw)) return defaults;
  return {
    detectedCategories: Array.isArray(raw['detectedCategories'])
      ? (raw['detectedCategories'] as NFRProfile['detectedCategories'])
      : [],
    weightedShards: Array.isArray(raw['weightedShards'])
      ? (raw['weightedShards'] as NFRProfile['weightedShards'])
      : [],
    overallCoverage: typeof raw['overallCoverage'] === 'number'
      ? raw['overallCoverage']
      : 0,
    blindSpots: Array.isArray(raw['blindSpots'])
      ? (raw['blindSpots'] as NFRProfile['blindSpots'])
      : [],
  };
}

export function buildIR(workDir: string): SRSIR {
  const extractDir = path.join(workDir, '2_extract');
  const allRecords: JsonlRecord[] = [];

  for (const subdir of EXTRACT_SUBDIRS) {
    const dirPath = path.join(extractDir, subdir);
    const files = listJsonlFiles(dirPath, workDir);
    for (const file of files) {
      allRecords.push(...readJsonl(file, workDir));
    }
  }

  const seen = new Set<string>();
  const records = allRecords.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const nodes = records.map(r => toIRNode(r));

  const edges: IREdge[] = [];
  for (const r of records) {
    edges.push(...toIREdges(r));
  }

  const shardIndexPath = path.join(workDir, '1_input', 'shard_index.json');
  let crossRefs: CrossRef[] = [];
  let nfrProfile: NFRProfile = {
    detectedCategories: [],
    weightedShards: [],
    overallCoverage: 0,
    blindSpots: [],
  };

  if (fs.existsSync(shardIndexPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(shardIndexPath, 'utf-8'));
      if (isRecord(raw)) {
        if (Array.isArray(raw['cross_references'])) {
          crossRefs = raw['cross_references'] as CrossRef[];
        }
        nfrProfile = safeParseNFRProfile(raw['nfr_profile']);
      }
    } catch {
      // Use defaults
    }
  }

  const meta: IRMeta = {
    sourcePath: workDir,
    sourceHash: '',
    language: 'en',
    totalChars: 0,
    totalShards: 0,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    buildTimestamp: new Date().toISOString(),
  };

  return {
    version: '2.0.0',
    meta,
    nodes,
    edges,
    crossRefs,
    nfrProfile,
    gaps: [],
    glossary: [],
  };
}

export function validateIR(ir: SRSIR): ValidationResult {
  const errors: string[] = [];

  if (ir.version !== '2.0.0') {
    errors.push(`Invalid version: expected '2.0.0', got '${ir.version}'`);
  }

  const nodeIds = new Set(ir.nodes.map(n => n.id));

  for (const edge of ir.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Dangling edge source '${edge.source}' (edge: ${edge.id})`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Dangling edge target '${edge.target}' (edge: ${edge.id})`);
    }
  }

  return { valid: errors.length === 0, errors };
}
