/**
 * generate-bdd.ts -- 从需求图谱生成 Gherkin BDD 骨架 (SRS §5.11)
 *
 * CLI: npx tsx index.ts generate-bdd --workdir .srs_formalizer
 *
 * 读取 graph/graph.merged.json → 按 Module 分组 → 为每个 Module 生成 Feature →
 * 为每个 Requirement 生成 Scenario。输出到 features/<module>.feature。
 *
 * 确定性：相同图谱→相同骨架。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Graph } from '../lib/graph.js';
import { generateFeature } from '../lib/bdd.js';
import { validateWorkDir } from '../lib/security.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseArg(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1 || idx + 1 >= args.length)
        return null;
    return args[idx + 1];
}
/** Graph files to try, in priority order. */
const GRAPH_PATHS = [
    'graph/graph.merged.json',
    'graph/graph.structure_fixed.json',
    'graph/graph.json',
];
/**
 * Determine the module name for a graph node.
 *
 * Priority:
 * 1. node.properties.module (string)
 * 2. Parse from source_file (e.g., "用户模块_S1.md" -> "用户模块")
 * 3. Fallback to "Unknown"
 */
function getModuleFromNode(node) {
    const moduleProp = node.properties.module;
    if (typeof moduleProp === 'string' && moduleProp.length > 0) {
        return moduleProp;
    }
    const sourceFile = node.properties.source_file;
    if (typeof sourceFile === 'string') {
        // Try to extract module from source_file pattern like "用户模块_S1.md"
        const match = sourceFile.match(/^(.+?)(?:_S\d+)?\.[^.]+$/);
        if (match?.[1])
            return match[1];
    }
    return 'Unknown';
}
/**
 * Build BDD scenarios from a list of graph nodes.
 */
function buildScenarios(nodes) {
    return nodes.map(node => ({
        name: `${node.id}: ${String(node.properties.statement ?? '')}`,
        requirementId: node.id,
        given: [`the requirement ${node.id} is defined`],
        when: ['the system is implemented according to the requirement'],
        then: ['<THEN_PLACEHOLDER>'],
    }));
}
/**
 * Sanitize a module name for use as a filename.
 * Replaces characters that are problematic on filesystems.
 */
function sanitizeModuleName(module) {
    return module.replace(/[/\\?%*:|"<>]/g, '_');
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function main(args) {
    const workDirArg = parseArg(args, '--workdir');
    if (!workDirArg) {
        return { status: 'error', message: 'Missing required argument: --workdir' };
    }
    let workDir;
    try {
        workDir = validateWorkDir(workDirArg);
    }
    catch (err) {
        return { status: 'error', message: err.message };
    }
    // Find the first existing graph file in priority order
    let graphPath = null;
    for (const relPath of GRAPH_PATHS) {
        const candidate = path.join(workDir, relPath);
        if (fs.existsSync(candidate)) {
            graphPath = candidate;
            break;
        }
    }
    if (!graphPath) {
        const tried = GRAPH_PATHS.map(p => path.join(workDir, p)).join(', ');
        return { status: 'error', message: `Graph file not found: tried ${tried}` };
    }
    // Load and parse graph
    let graphData;
    try {
        const raw = fs.readFileSync(graphPath, 'utf-8');
        graphData = JSON.parse(raw);
    }
    catch (err) {
        return { status: 'error', message: `Failed to parse graph file: ${err.message}` };
    }
    const graph = Graph.fromJSON(graphData);
    const allNodes = graph.getAllNodes();
    // Group nodes by module
    const moduleGroups = new Map();
    for (const node of allNodes) {
        const module = getModuleFromNode(node);
        const group = moduleGroups.get(module);
        if (group) {
            group.push(node);
        }
        else {
            moduleGroups.set(module, [node]);
        }
    }
    // Ensure output directory
    const featuresDir = path.join(workDir, 'features');
    if (!fs.existsSync(featuresDir)) {
        fs.mkdirSync(featuresDir, { recursive: true });
    }
    // Generate feature files, sorted by module name for determinism
    const sortedModules = [...moduleGroups.keys()].sort();
    let featuresCreated = 0;
    for (const moduleName of sortedModules) {
        const nodes = moduleGroups.get(moduleName);
        // Sort nodes by ID for deterministic output
        nodes.sort((a, b) => a.id.localeCompare(b.id));
        const scenarios = buildScenarios(nodes);
        const feature = {
            system: 'SRS',
            trace: 'PENDING',
            module: moduleName,
            scenarios,
        };
        const featureContent = generateFeature(feature);
        const safeName = sanitizeModuleName(moduleName);
        const outputPath = path.join(featuresDir, `${safeName}.feature`);
        fs.writeFileSync(outputPath, featureContent, 'utf-8');
        featuresCreated++;
    }
    return {
        status: 'ok',
        data: {
            features_created: featuresCreated,
            modules: sortedModules,
            total_requirements: allNodes.length,
        },
    };
}
//# sourceMappingURL=generate-bdd.js.map