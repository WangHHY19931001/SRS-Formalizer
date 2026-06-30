/**
 * validate-bdd.ts -- 校验 Gherkin BDD 文件 (SRS §5.12)
 *
 * CLI: npx tsx index.ts validate-bdd --workdir .srs_formalizer
 *
 * 遍历 features/ 下所有 .feature 文件，调用 lib/bdd.ts 的 validateFeature
 * 逐文件校验并汇总结果。
 *
 * 输出格式: {"status":"ok","data":{"valid":true/false,"errors":[...],"warnings":[...]}}
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFeature } from '../lib/bdd.js';
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
    const featuresDir = path.join(workDir, 'features');
    // If features/ doesn't exist, return empty success
    if (!fs.existsSync(featuresDir)) {
        return {
            status: 'ok',
            data: {
                valid: true,
                errors: [],
                warnings: [],
                files_checked: 0,
                file_results: [],
            },
        };
    }
    // Collect all .feature files, sorted for determinism
    let featureFiles;
    try {
        featureFiles = fs.readdirSync(featuresDir)
            .filter(f => f.endsWith('.feature'))
            .sort();
    }
    catch {
        return { status: 'ok', data: { valid: true, errors: [], warnings: [], files_checked: 0, file_results: [] } };
    }
    // Validate each file
    const fileResults = [];
    let globalValid = true;
    const globalErrors = [];
    const globalWarnings = [];
    for (const fileName of featureFiles) {
        const filePath = path.join(featuresDir, fileName);
        const content = fs.readFileSync(filePath, 'utf-8');
        const result = validateFeature(content);
        fileResults.push({ file: fileName, result });
        if (!result.valid) {
            globalValid = false;
            for (const err of result.errors) {
                globalErrors.push(`[${fileName}] ${err}`);
            }
        }
        for (const warn of result.warnings) {
            globalWarnings.push(`[${fileName}] ${warn}`);
        }
    }
    return {
        status: 'ok',
        data: {
            valid: globalValid,
            errors: globalErrors,
            warnings: globalWarnings,
            files_checked: featureFiles.length,
            file_results: fileResults,
        },
    };
}
//# sourceMappingURL=validate-bdd.js.map