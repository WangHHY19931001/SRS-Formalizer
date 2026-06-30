/**
 * merge-structure.ts — 合并子代理结构补全建议命令
 *
 * CLI: npx tsx index.ts merge-structure --workdir .srs_formalizer
 *
 * 读取 analysis/ 下的子代理补全 JSONL 文件，应用三种操作：
 *   - add_relation:    添加新边
 *   - fix_dangling:    修正悬挂边的目标节点
 *   - add_requirement: 添加新的 SupplementalRequirement 节点
 *
 * 输出 graph/graph.structure_fixed.json + graph/structure_merge_log.jsonl
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Graph } from '../lib/graph.js';
import { validateWorkDir } from '../lib/security.js';
import { listJsonlFiles } from '../lib/jsonl.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseArg(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1 || idx + 1 >= args.length)
        return null;
    return args[idx + 1];
}
const VALID_SUGGESTION_TYPES = ['add_relation', 'fix_dangling', 'add_requirement'];
/**
 * Check if a parsed record has the required fields for a CompletionSuggestion.
 */
function isSuggestionRecord(record) {
    if (typeof record !== 'object' || record === null)
        return false;
    const obj = record;
    return (typeof obj.gap_id === 'string' &&
        typeof obj.suggestion_type === 'string' &&
        typeof obj.suggestion === 'string');
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
    // Read graph/graph.json
    const graphPath = path.join(workDir, 'graph', 'graph.json');
    if (!fs.existsSync(graphPath)) {
        return { status: 'error', message: `Graph file not found: ${graphPath}` };
    }
    let graphData;
    try {
        const raw = fs.readFileSync(graphPath, 'utf-8');
        graphData = JSON.parse(raw);
    }
    catch (err) {
        return { status: 'error', message: `Failed to parse graph file: ${err.message}` };
    }
    let graph = Graph.fromJSON(graphData);
    const logEntries = [];
    // Collect suggestion JSONL files from analysis/
    const analysisDir = path.join(workDir, 'analysis');
    const suggestionFiles = [];
    try {
        const files = listJsonlFiles(analysisDir, workDir);
        // Exclude analysis output files (they are not suggestion inputs)
        suggestionFiles.push(...files.filter(f => {
            const basename = path.basename(f);
            return !['orphan_nodes.jsonl', 'dangling_edges.jsonl', 'concept_islands.jsonl'].includes(basename);
        }));
    }
    catch {
        // analysis/ directory does not exist — no suggestions to process
    }
    // Parse suggestion records from all files
    const suggestions = [];
    for (const filePath of suggestionFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '')
                continue;
            let parsed;
            try {
                parsed = JSON.parse(line);
            }
            catch {
                logEntries.push({
                    gap_id: 'unknown',
                    suggestion_type: 'unknown',
                    action: 'skipped',
                    reason: `JSON parse error at ${path.basename(filePath)}:${i + 1}`,
                    timestamp: new Date().toISOString(),
                });
                continue;
            }
            if (isSuggestionRecord(parsed)) {
                suggestions.push(parsed);
            }
        }
    }
    // Process each suggestion
    for (const sug of suggestions) {
        const timestamp = new Date().toISOString();
        // Validate suggestion_type
        if (!VALID_SUGGESTION_TYPES.includes(sug.suggestion_type)) {
            logEntries.push({
                gap_id: sug.gap_id,
                suggestion_type: sug.suggestion_type,
                action: 'skipped',
                reason: `Unknown suggestion_type: "${sug.suggestion_type}"`,
                timestamp,
            });
            continue;
        }
        try {
            switch (sug.suggestion_type) {
                // ---------------------------------------------------------------
                // add_relation: 添加一条新边
                // ---------------------------------------------------------------
                case 'add_relation': {
                    const details = JSON.parse(sug.suggestion);
                    if (!details.source || !details.target || !details.type) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: 'Missing required fields in suggestion (source, target, type)',
                            timestamp,
                        });
                        continue;
                    }
                    if (!graph.hasNode(details.source)) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: `Source node not found: ${details.source}`,
                            timestamp,
                        });
                        continue;
                    }
                    if (!graph.hasNode(details.target)) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: `Target node not found: ${details.target}`,
                            timestamp,
                        });
                        continue;
                    }
                    const edgeId = `${details.source}--:${details.type}--${details.target}`;
                    graph.addEdge({
                        id: edgeId,
                        source: details.source,
                        target: details.target,
                        type: `:${details.type}`,
                    });
                    logEntries.push({
                        gap_id: sug.gap_id,
                        suggestion_type: sug.suggestion_type,
                        action: 'applied',
                        reason: `Added edge ${edgeId}`,
                        timestamp,
                    });
                    break;
                }
                // ---------------------------------------------------------------
                // fix_dangling: 修正悬挂边的目标节点
                // ---------------------------------------------------------------
                case 'fix_dangling': {
                    const details = JSON.parse(sug.suggestion);
                    if (!details.edge_id || !details.new_target) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: 'Missing required fields in suggestion (edge_id, new_target)',
                            timestamp,
                        });
                        continue;
                    }
                    // Verify the edge exists in the graph
                    const currentData = graph.toJSON();
                    const edgeExists = currentData.edges.some(e => e.id === details.edge_id);
                    if (!edgeExists) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: `Edge not found: ${details.edge_id}`,
                            timestamp,
                        });
                        continue;
                    }
                    // Verify the new target exists
                    if (!graph.hasNode(details.new_target)) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: `New target node not found: ${details.new_target}`,
                            timestamp,
                        });
                        continue;
                    }
                    // Rebuild graph data with the fixed edge target
                    const updatedData = graph.toJSON();
                    updatedData.edges = updatedData.edges.map(e => e.id === details.edge_id ? { ...e, target: details.new_target } : e);
                    graph = Graph.fromJSON(updatedData);
                    logEntries.push({
                        gap_id: sug.gap_id,
                        suggestion_type: sug.suggestion_type,
                        action: 'applied',
                        reason: `Fixed edge ${details.edge_id} target → ${details.new_target}`,
                        timestamp,
                    });
                    break;
                }
                // ---------------------------------------------------------------
                // add_requirement: 添加新节点
                // ---------------------------------------------------------------
                case 'add_requirement': {
                    const details = JSON.parse(sug.suggestion);
                    if (!details.id) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: 'Missing required field "id" in suggestion',
                            timestamp,
                        });
                        continue;
                    }
                    if (graph.hasNode(details.id)) {
                        logEntries.push({
                            gap_id: sug.gap_id,
                            suggestion_type: sug.suggestion_type,
                            action: 'skipped',
                            reason: `Node already exists: ${details.id}`,
                            timestamp,
                        });
                        continue;
                    }
                    graph.addNode({
                        id: details.id,
                        labels: [':SupplementalRequirement'],
                        properties: {
                            statement: details.statement ?? '',
                            source_file: details.source_file ?? '',
                            confidence: details.confidence ?? 'medium',
                            category: details.category ?? 'explicit',
                        },
                    });
                    logEntries.push({
                        gap_id: sug.gap_id,
                        suggestion_type: sug.suggestion_type,
                        action: 'applied',
                        reason: `Added node ${details.id}`,
                        timestamp,
                    });
                    break;
                }
            }
        }
        catch (err) {
            logEntries.push({
                gap_id: sug.gap_id,
                suggestion_type: sug.suggestion_type,
                action: 'skipped',
                reason: `Error processing suggestion: ${err.message}`,
                timestamp,
            });
        }
    }
    // Write updated graph
    const graphDir = path.join(workDir, 'graph');
    if (!fs.existsSync(graphDir)) {
        fs.mkdirSync(graphDir, { recursive: true });
    }
    const outputGraphPath = path.join(graphDir, 'graph.structure_fixed.json');
    fs.writeFileSync(outputGraphPath, JSON.stringify(graph.toJSON(), null, 2), 'utf-8');
    // Write merge log
    const logPath = path.join(graphDir, 'structure_merge_log.jsonl');
    const logContent = logEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(logPath, logContent, 'utf-8');
    return {
        status: 'ok',
        data: {
            suggestions_processed: suggestions.length,
            applied: logEntries.filter(e => e.action === 'applied').length,
            skipped: logEntries.filter(e => e.action === 'skipped').length,
        },
    };
}
//# sourceMappingURL=merge-structure.js.map