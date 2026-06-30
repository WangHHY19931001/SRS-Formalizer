/**
 * analyze-graph.ts — 需求知识图谱语义分析命令（SRS §5.8）
 *
 * CLI: npx tsx index.ts analyze-graph --workdir .srs_formalizer
 *
 * 读取 graph/graph.structure_fixed.json（如不存在则读 graph/graph.json），
 * 执行三个维度的分析：
 *   1. Jaccard 相似度 — 识别疑似重复需求
 *   2. 反义检测       — 识别语义冲突
 *   3. 同对象多侧面   — 同一概念对象的不同描述侧面
 *
 * 输出分析结果到 analysis/ 目录，并生成子代理审查提示词。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Graph } from '../lib/graph.js';
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
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
function writeJsonlFile(filePath, records) {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    const content = records.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(filePath, content + (records.length > 0 ? '\n' : ''), 'utf-8');
}
// ---------------------------------------------------------------------------
// Tokenization & Jaccard similarity
// ---------------------------------------------------------------------------
/**
 * Tokenize a statement into a set of tokens.
 * For Chinese text, extracts individual CJK characters and alphanumeric words.
 * For English text, extracts lowercase words.
 */
function tokenize(text) {
    const tokens = new Set();
    const lower = text.toLowerCase();
    // Extract CJK characters
    const cjkRegex = /[一-鿿㐀-䶿豈-﫿]/g;
    let match;
    while ((match = cjkRegex.exec(lower)) !== null) {
        tokens.add(match[0]);
    }
    // Extract alphanumeric words
    const wordRegex = /[a-z0-9_]+/g;
    while ((match = wordRegex.exec(lower)) !== null) {
        tokens.add(match[0]);
    }
    return tokens;
}
/**
 * Compute Jaccard similarity between two sets.
 * J(A, B) = |A n B| / |A u B|, returns 0 for empty sets.
 */
function jaccardSimilarity(a, b) {
    const union = new Set([...a, ...b]);
    if (union.size === 0)
        return 0;
    let intersectionSize = 0;
    for (const token of a) {
        if (b.has(token))
            intersectionSize++;
    }
    return intersectionSize / union.size;
}
// ---------------------------------------------------------------------------
// Antonym / negation detection
// ---------------------------------------------------------------------------
const NEGATION_PATTERNS = [
    /不[应能会可]/,
    /必须不/,
    /不得/,
    /禁止/,
    /严禁/,
    /不应/,
];
const AFFIRMATION_PATTERNS = [
    /[应能会可]/,
    /必须/,
    /需要/,
    /应当/,
];
/** Check if a statement contains negation patterns. */
function hasNegation(text) {
    return NEGATION_PATTERNS.some(p => p.test(text));
}
/** Check if a statement contains affirmation patterns. */
function hasAffirmation(text) {
    // Avoid matching negation patterns as affirmation
    if (hasNegation(text))
        return false;
    return AFFIRMATION_PATTERNS.some(p => p.test(text));
}
/**
 * Detect whether a pair of statements forms an antonym pair.
 * One statement has negation, the other has affirmation without negation.
 */
function isAntonymPair(textA, textB) {
    const aNeg = hasNegation(textA);
    const bNeg = hasNegation(textB);
    const aAff = hasAffirmation(textA);
    const bAff = hasAffirmation(textB);
    return (aNeg && bAff && !bNeg) || (bNeg && aAff && !aNeg);
}
// ---------------------------------------------------------------------------
// Same-object multi-aspect detection
// ---------------------------------------------------------------------------
/**
 * Extract CJK bigrams from text that may represent noun phrases / objects.
 * e.g. "用户"、"登录"、"支付"、"加密"
 */
function extractCjkBigrams(text) {
    const chars = [...text].filter(c => /[一-鿿]/.test(c));
    const bigrams = [];
    for (let i = 0; i < chars.length - 1; i++) {
        bigrams.push(chars[i] + chars[i + 1]);
    }
    return bigrams;
}
/**
 * Filter bigrams that are too common to be meaningful objects (stopword bigrams).
 */
const STOPWORD_BIGRAMS = new Set([
    '可以', '需要', '进行', '通过', '使用', '一个', '这个', '那个',
    '这些', '那些', '什么', '如何', '如果', '因为', '所以', '但是',
    '而且', '或者', '不是', '就是', '还是', '没有', '已经', '以及',
    '其中', '之后', '其中', '以上', '以下', '之间', '并且',
]);
function isMeaningfulBigram(bigram) {
    return !STOPWORD_BIGRAMS.has(bigram);
}
/**
 * Find clusters of requirement nodes that share a common conceptual object.
 */
function findSameAspectClusters(graph, nodeIds) {
    // Extract bigrams for all requirement nodes
    const nodeBigrams = new Map();
    const nodeStatements = new Map();
    for (const nodeId of nodeIds) {
        const node = graph.getNode(nodeId);
        if (!node)
            continue;
        const statement = node.properties.statement ?? '';
        nodeStatements.set(nodeId, statement);
        nodeBigrams.set(nodeId, extractCjkBigrams(statement));
    }
    // Build bigram -> nodeId index
    const bigramNodes = new Map();
    for (const [nodeId, bigrams] of nodeBigrams) {
        for (const bigram of bigrams) {
            if (!isMeaningfulBigram(bigram))
                continue;
            if (!bigramNodes.has(bigram)) {
                bigramNodes.set(bigram, new Set());
            }
            bigramNodes.get(bigram).add(nodeId);
        }
    }
    // Build clusters for bigrams that appear in >= 2 nodes
    const seenNodes = new Set();
    const clusters = [];
    // Sort bigrams by frequency (descending) to build meaningful clusters
    const sortedBigrams = [...bigramNodes.entries()]
        .filter(([_, ids]) => ids.size >= 2)
        .sort((a, b) => b[1].size - a[1].size);
    for (const [bigram, nodeIdsSet] of sortedBigrams) {
        const ids = [...nodeIdsSet].filter(id => !seenNodes.has(id));
        if (ids.length >= 2) {
            for (const id of ids)
                seenNodes.add(id);
            clusters.push({
                object: bigram,
                nodes: ids,
                statements: ids.map(id => nodeStatements.get(id) ?? ''),
            });
        }
    }
    return clusters;
}
// ---------------------------------------------------------------------------
// Sub-agent prompt generation
// ---------------------------------------------------------------------------
/**
 * Generate duplicate analysis markdown for sub-agent review.
 */
function generateDuplicateAnalysisMd(pairs) {
    const lines = [];
    lines.push('# 疑似重复需求分析');
    lines.push('');
    lines.push('以下需求对经 Jaccard 相似度分析（阈值 > 0.7）标记为疑似重复，请子代理逐条审查并给出判决。');
    lines.push('');
    lines.push('| PairID | 节点A | 节点B | Jaccard | 语句A | 语句B |');
    lines.push('|--------|-------|-------|---------|-------|-------|');
    for (const p of pairs) {
        const simStr = p.similarity.toFixed(3);
        // Truncate long statements for table readability
        const sA = p.statementA.length > 50 ? p.statementA.slice(0, 47) + '...' : p.statementA;
        const sB = p.statementB.length > 50 ? p.statementB.slice(0, 47) + '...' : p.statementB;
        lines.push(`| ${p.pairId} | ${p.nodeA} | ${p.nodeB} | ${simStr} | ${sA} | ${sB} |`);
    }
    lines.push('');
    lines.push('## 判决格式');
    lines.push('');
    lines.push('每条请输出一行 JSONL：');
    lines.push('```jsonl');
    lines.push('{"pair_id":"DUP-001","verdict":"duplicate|not_duplicate","reasoning":"...","recommended_action":"merge|skip"}');
    lines.push('```');
    lines.push('');
    return lines.join('\n');
}
/**
 * Generate conflict analysis markdown for sub-agent review.
 */
function generateConflictAnalysisMd(pairs) {
    const lines = [];
    lines.push('# 疑似语义冲突分析');
    lines.push('');
    lines.push('以下需求对经反义检测标记为疑似冲突，请子代理逐条审查并给出判决。');
    lines.push('');
    lines.push('| PairID | 节点A | 节点B | 相似度 | A含否定 | B含否定 | 语句A | 语句B |');
    lines.push('|--------|-------|-------|--------|---------|---------|-------|-------|');
    for (const p of pairs) {
        const simStr = p.similarity.toFixed(3);
        const sA = p.statementA.length > 40 ? p.statementA.slice(0, 37) + '...' : p.statementA;
        const sB = p.statementB.length > 40 ? p.statementB.slice(0, 37) + '...' : p.statementB;
        lines.push(`| ${p.pairId} | ${p.nodeA} | ${p.nodeB} | ${simStr} | ${p.negationInA ? '是' : '否'} | ${p.negationInB ? '是' : '否'} | ${sA} | ${sB} |`);
    }
    lines.push('');
    lines.push('## 判决格式');
    lines.push('');
    lines.push('每条请输出一行 JSONL：');
    lines.push('```jsonl');
    lines.push('{"pair_id":"CON-001","verdict":"conflict|not_conflict","reasoning":"...","recommended_action":"add_conflict_edge|skip"}');
    lines.push('```');
    lines.push('');
    return lines.join('\n');
}
/**
 * Generate aspect analysis markdown for sub-agent review.
 */
function generateAspectAnalysisMd(clusters) {
    const lines = [];
    lines.push('# 同对象多侧面分析');
    lines.push('');
    lines.push('以下集群共享同一概念对象但描述不同侧面，请子代理逐条审查并给出判决。');
    lines.push('');
    lines.push('| ClusterID | 对象 | 节点数 | 节点列表 | 语句摘要 |');
    lines.push('|-----------|------|--------|----------|----------|');
    for (const c of clusters) {
        const nodeListStr = c.nodes.join(', ');
        const stmtSummary = c.statements.map(s => s.length > 30 ? s.slice(0, 27) + '...' : s).join('; ');
        lines.push(`| ${c.clusterId} | ${c.object} | ${c.nodes.length} | ${nodeListStr} | ${stmtSummary} |`);
    }
    lines.push('');
    lines.push('## 判决格式');
    lines.push('');
    lines.push('每条请输出一行 JSONL：');
    lines.push('```jsonl');
    lines.push('{"pair_id":"ASP-001","verdict":"same_aspect|not_same_aspect","reasoning":"...","recommended_action":"add_same_aspect_edge|skip"}');
    lines.push('```');
    lines.push('');
    return lines.join('\n');
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
    // Read graph — prefer graph.structure_fixed.json, fallback to graph.json
    const fixedGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
    const fallbackGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
    let graphPath;
    if (fs.existsSync(fixedGraphPath)) {
        graphPath = fixedGraphPath;
    }
    else if (fs.existsSync(fallbackGraphPath)) {
        graphPath = fallbackGraphPath;
    }
    else {
        return { status: 'error', message: `Graph file not found: tried ${fixedGraphPath} and ${fallbackGraphPath}` };
    }
    let graphData;
    try {
        const raw = fs.readFileSync(graphPath, 'utf-8');
        graphData = JSON.parse(raw);
    }
    catch (err) {
        return { status: 'error', message: `Failed to parse graph file: ${err.message}` };
    }
    const graph = Graph.fromJSON(graphData);
    // Collect all :Requirement nodes
    const reqNodes = graph.getAllNodes().filter(n => n.labels.includes(':Requirement'));
    const reqIds = reqNodes.map(n => n.id);
    const reqStatements = new Map();
    for (const n of reqNodes) {
        reqStatements.set(n.id, n.properties.statement ?? '');
    }
    // Ensure output directories
    const analysisDir = path.join(workDir, '3_graph', 'analysis');
    const promptsDir = path.join(analysisDir, 'subagent_prompts');
    ensureDir(analysisDir);
    ensureDir(promptsDir);
    // =========================================================================
    // 1. Jaccard similarity — suspected duplicates
    // =========================================================================
    const tokenCache = new Map();
    for (const id of reqIds) {
        const stmt = reqStatements.get(id) ?? '';
        tokenCache.set(id, tokenize(stmt));
    }
    const duplicatePairs = [];
    let dupIdx = 0;
    for (let i = 0; i < reqIds.length; i++) {
        const idA = reqIds[i];
        for (let j = i + 1; j < reqIds.length; j++) {
            const idB = reqIds[j];
            const tokensA = tokenCache.get(idA);
            const tokensB = tokenCache.get(idB);
            const sim = jaccardSimilarity(tokensA, tokensB);
            if (sim > 0.7) {
                dupIdx++;
                duplicatePairs.push({
                    pairId: `DUP-${String(dupIdx).padStart(3, '0')}`,
                    nodeA: idA,
                    nodeB: idB,
                    similarity: Math.round(sim * 1000) / 1000, // round to 3 decimal places
                    statementA: reqStatements.get(idA) ?? '',
                    statementB: reqStatements.get(idB) ?? '',
                });
            }
        }
    }
    writeJsonlFile(path.join(analysisDir, 'suspected_duplicates.jsonl'), duplicatePairs);
    // =========================================================================
    // 2. Antonym detection — suspected conflicts
    // =========================================================================
    const conflictPairs = [];
    let conIdx = 0;
    for (let i = 0; i < reqIds.length; i++) {
        const idA = reqIds[i];
        for (let j = i + 1; j < reqIds.length; j++) {
            const idB = reqIds[j];
            const stmtA = reqStatements.get(idA) ?? '';
            const stmtB = reqStatements.get(idB) ?? '';
            if (isAntonymPair(stmtA, stmtB)) {
                conIdx++;
                const tokensA = tokenCache.get(idA);
                const tokensB = tokenCache.get(idB);
                const sim = jaccardSimilarity(tokensA, tokensB);
                conflictPairs.push({
                    pairId: `CON-${String(conIdx).padStart(3, '0')}`,
                    nodeA: idA,
                    nodeB: idB,
                    similarity: Math.round(sim * 1000) / 1000,
                    statementA: stmtA,
                    statementB: stmtB,
                    negationInA: hasNegation(stmtA),
                    negationInB: hasNegation(stmtB),
                });
            }
        }
    }
    writeJsonlFile(path.join(analysisDir, 'suspected_conflicts.jsonl'), conflictPairs);
    // =========================================================================
    // 3. Same-object multi-aspect — aspect clusters
    // =========================================================================
    const aspectClusters = findSameAspectClusters(graph, reqIds);
    const aspectRecords = aspectClusters.map((c, idx) => ({
        clusterId: `ASP-${String(idx + 1).padStart(3, '0')}`,
        object: c.object,
        nodes: c.nodes,
        statements: c.statements,
    }));
    writeJsonlFile(path.join(analysisDir, 'same_aspect_clusters.jsonl'), aspectRecords);
    // =========================================================================
    // 4. Generate sub-agent prompt files
    // =========================================================================
    const dupMd = generateDuplicateAnalysisMd(duplicatePairs);
    fs.writeFileSync(path.join(promptsDir, 'duplicate_analysis.md'), dupMd, 'utf-8');
    const conMd = generateConflictAnalysisMd(conflictPairs);
    fs.writeFileSync(path.join(promptsDir, 'conflict_analysis.md'), conMd, 'utf-8');
    const aspMd = generateAspectAnalysisMd(aspectRecords);
    fs.writeFileSync(path.join(promptsDir, 'aspect_analysis.md'), aspMd, 'utf-8');
    return {
        status: 'ok',
        data: {
            duplicate_pairs: duplicatePairs.length,
            conflict_pairs: conflictPairs.length,
            aspect_clusters: aspectRecords.length,
            analysis_dir: analysisDir,
        },
    };
}
//# sourceMappingURL=analyze-graph.js.map