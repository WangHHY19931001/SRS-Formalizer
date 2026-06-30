import * as path from 'node:path';
export function isPathSafe(targetPath, workDir) {
    const resolved = path.resolve(targetPath);
    const workDirResolved = path.resolve(workDir);
    return resolved.startsWith(workDirResolved + path.sep) || resolved === workDirResolved;
}
export function assertSafePath(targetPath, workDir) {
    if (!isPathSafe(targetPath, workDir)) {
        throw new Error(`SecurityError: Path "${targetPath}" is outside work directory "${workDir}". Access denied.`);
    }
}
export function validateWorkDir(outputArg) {
    const basename = path.basename(path.resolve(outputArg));
    if (basename !== '.srs_formalizer') {
        throw new Error(`SecurityError: Output directory must be ".srs_formalizer", got "${basename}".`);
    }
    return path.resolve(outputArg);
}
//# sourceMappingURL=security.js.map