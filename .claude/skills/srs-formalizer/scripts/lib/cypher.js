/** 生成 CREATE 节点语句 */
export function generateCreateNode(node) {
    const labels = node.labels.map(l => `:${l}`).join('');
    const props = Object.entries(node.properties)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ');
    return `CREATE (${labels} {${props}})`;
}
/** 生成 CREATE 边语句 */
export function generateCreateEdge(edge) {
    // MATCH (a), (b) WHERE a.id = 'source' AND b.id = 'target' CREATE (a)-[:TYPE]->(b)
    return `MATCH (a), (b) WHERE a.id = '${edge.source}' AND b.id = '${edge.target}' CREATE (a)-[:${edge.type}]->(b)`;
}
/** 生成唯一性约束 */
export function generateConstraints() {
    return [
        'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Requirement) REQUIRE n.id IS UNIQUE',
        'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE',
        'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Actor) REQUIRE n.id IS UNIQUE',
    ];
}
/** 生成完整 Cypher 脚本 */
export function generateFullScript(graph) {
    const lines = [
        '// SRS-Formalizer Knowledge Graph',
        '// Auto-generated Cypher script',
        '',
        '// === Constraints ===',
        ...generateConstraints(),
        '',
        '// === Nodes ===',
        ...graph.getAllNodes().map(generateCreateNode),
        '',
        '// === Edges ===',
        ...graph.getAllEdges().map(generateCreateEdge),
    ];
    return lines.join(';\n') + ';\n';
}
//# sourceMappingURL=cypher.js.map