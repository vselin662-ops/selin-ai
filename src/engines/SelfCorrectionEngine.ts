// src/engines/SelfCorrectionEngine.ts
import { logger } from '../logger';

export interface ValidationCriteria {
  minLength?: number;
  maxLength?: number;
  requiredSubstrings?: string[];
  forbiddenSubstrings?: string[];
}

export interface CorrectionResult<T> {
  success: boolean;
  data: T;
  iterations: number;
  issues: string[];
}

export class SelfCorrectionEngine {
  private static readonly MAX_ITERATIONS = 3;

  public static async generateWithCorrection<T>(
    generateFn: (attempt: number, lastIssues: string[]) => Promise<T>,
    validateFn: (data: T) => { valid: boolean; issues: string[] }
  ): Promise<CorrectionResult<T>> {
    let lastData: T | undefined;
    let issues: string[] = [];

    for (let attempt = 1; attempt <= this.MAX_ITERATIONS; attempt++) {
      try {
        lastData = await generateFn(attempt, issues);
        const check = validateFn(lastData);

        if (check.valid) {
          logger.info(`[SelfCorrectionEngine] Generation passed on attempt ${attempt}`);
          return {
            success: true,
            data: lastData,
            iterations: attempt,
            issues: []
          };
        }

        issues = check.issues;
        logger.warn(`[SelfCorrectionEngine] Attempt ${attempt} failed validation: ${issues.join(', ')}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        issues = [msg];
        logger.error(`[SelfCorrectionEngine] Exception on attempt ${attempt}: ${msg}`);
      }
    }

    return {
      success: false,
      data: lastData as T,
      iterations: this.MAX_ITERATIONS,
      issues
    };
  }

  // Alias for backward compatibility
  public static async executeWithCorrection<T>(
    generateFn: (attempt: number, lastIssues: string[]) => Promise<T>,
    validateFn: (data: T) => { valid: boolean; issues: string[] }
  ): Promise<CorrectionResult<T>> {
    return this.generateWithCorrection(generateFn, validateFn);
  }
}
