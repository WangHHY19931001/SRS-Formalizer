export interface BddScenario {
    name: string;
    requirementId: string;
    given: string[];
    when: string[];
    then: string[];
    verification_method?: string;
}
export interface BddFeature {
    system: string;
    trace: string;
    module: string;
    scenarios: BddScenario[];
}
/** 生成 .feature 文件内容 */
export declare function generateFeature(feature: BddFeature): string;
export interface BddValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/** 校验 .feature 文件内容 */
export declare function validateFeature(content: string): BddValidationResult;
