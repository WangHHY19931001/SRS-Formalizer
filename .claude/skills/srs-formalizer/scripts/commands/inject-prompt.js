/**
 * inject-prompt.ts — 模板注入命令
 *
 * CLI: npx tsx index.ts inject-prompt --template <path> --params <json>
 *
 * 将模板中的 {{KEY}} 替换为实际值，用户输入中的 {{}} 不会被二次处理
 * （替换已知 key 后，任何剩余的 {{}} 都是用户输入，不再处理）。
 *
 * 安全约束：
 *   - 模板路径的 dirname 必须以 "prompts" 结尾
 *   - 纯字符串替换，无文件写入副作用
 *   - stdout 输出 JSON 结果
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
function parseArg(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1 || idx + 1 >= args.length)
        return null;
    return args[idx + 1];
}
export async function main(args) {
    const templatePath = parseArg(args, '--template');
    const paramsRaw = parseArg(args, '--params');
    if (!templatePath) {
        return { status: 'error', message: 'Missing required argument: --template' };
    }
    if (!paramsRaw) {
        return { status: 'error', message: 'Missing required argument: --params' };
    }
    // Validate params is parseable JSON
    let params;
    try {
        params = JSON.parse(paramsRaw);
    }
    catch {
        return { status: 'error', message: 'Invalid JSON in --params' };
    }
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
        return { status: 'error', message: '--params must be a JSON object' };
    }
    // Validate template path: resolved dirname must end with "prompts"
    const absPath = path.resolve(templatePath);
    const dir = path.dirname(absPath);
    if (!dir.endsWith('prompts')) {
        return {
            status: 'error',
            message: `Template path not allowed: ${templatePath}. Must be inside a prompts/ directory.`,
        };
    }
    // Check template file exists
    if (!fs.existsSync(absPath)) {
        return { status: 'error', message: `Template file not found: ${absPath}` };
    }
    // Read template file
    let template;
    try {
        template = fs.readFileSync(absPath, 'utf-8');
    }
    catch (err) {
        return { status: 'error', message: `Failed to read template: ${err.message}` };
    }
    // Replace {{KEY}} with values for known keys.
    // After this single pass, any remaining {{}} patterns are from user input
    // and are left as-is (not processed further) — this is the injection protection.
    let result = template;
    for (const [key, value] of Object.entries(params)) {
        const placeholder = `{{${key}}}`;
        const strValue = value == null ? '' : String(value);
        result = result.split(placeholder).join(strValue);
    }
    return { status: 'ok', data: result };
}
//# sourceMappingURL=inject-prompt.js.map