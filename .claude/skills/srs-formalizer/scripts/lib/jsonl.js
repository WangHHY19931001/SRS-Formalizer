import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertSafePath } from './security.js';
export function readJsonl(filePath, workDir) {
    assertSafePath(filePath, workDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const records = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '')
            continue;
        try {
            records.push(JSON.parse(line));
        }
        catch {
            throw new Error(`JSONL parse error at ${filePath}:${i + 1}: invalid JSON`);
        }
    }
    return records;
}
export function writeJsonl(filePath, records, workDir) {
    assertSafePath(filePath, workDir);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf-8');
}
export function listJsonlFiles(dirPath, workDir) {
    assertSafePath(dirPath, workDir);
    if (!fs.existsSync(dirPath))
        return [];
    return fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => path.join(dirPath, f));
}
//# sourceMappingURL=jsonl.js.map