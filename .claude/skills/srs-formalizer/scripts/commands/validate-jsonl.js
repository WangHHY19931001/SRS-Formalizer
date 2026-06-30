/**
 * validate-jsonl.ts — JSONL 文件校验命令
 *
 * CLI: npx tsx index.ts validate-jsonl --file <path> --workdir <path>
 *
 * 6 项检查：合法 JSON / 必填字段 / id 格式 / category 枚举 / 空 statement / 重复 id
 *
 * 复用 lib/jsonl.ts 的 readJsonl + validateJsonlRecord 函数
 * 复用 lib/security.ts 的 isPathSafe + validateWorkDir
 */
import { readJsonl, validateJsonlRecord } from '../lib/jsonl.js';
import { isPathSafe, validateWorkDir } from '../lib/security.js';
function parseArg(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1 || idx + 1 >= args.length)
        return null;
    return args[idx + 1];
}
export async function main(args) {
    const filePath = parseArg(args, '--file');
    const workDirArg = parseArg(args, '--workdir');
    if (!filePath) {
        return { status: 'error', message: 'Missing required argument: --file' };
    }
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
    // Check path security before reading
    if (!isPathSafe(filePath, workDir)) {
        return {
            status: 'error',
            message: `SecurityError: Path "${filePath}" is outside work directory "${workDir}". Access denied.`,
        };
    }
    // Read and parse JSONL
    let records;
    try {
        records = readJsonl(filePath, workDir);
    }
    catch (err) {
        // JSON parse error — include as validation error
        return {
            status: 'ok',
            data: {
                valid: false,
                errors: [err.message],
                warnings: [],
                record_count: 0,
            },
        };
    }
    const errors = [];
    const seenIds = new Map();
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const recordErrors = validateJsonlRecord(record, i);
        errors.push(...recordErrors);
        if (record.id) {
            const indices = seenIds.get(record.id);
            if (indices) {
                indices.push(i);
            }
            else {
                seenIds.set(record.id, [i]);
            }
        }
    }
    // Report duplicate ids
    for (const [id, indices] of seenIds) {
        if (indices.length > 1) {
            errors.push(`record[${indices[0]}]: duplicate id "${id}" appears at indices [${indices.join(', ')}]`);
        }
    }
    return {
        status: 'ok',
        data: {
            valid: errors.length === 0,
            errors,
            warnings: [],
            record_count: records.length,
        },
    };
}
//# sourceMappingURL=validate-jsonl.js.map