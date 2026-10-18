// src/engines/CascadeEngine.ts
import { logger } from '../logger';

export interface CascadeStep<TInput, TOutput> {
  name: string;
  execute: (input: TInput) => Promise<TOutput | null>;
}

export class CascadeEngine {
  public static async executeCascade<TInput, TOutput>(
    steps: CascadeStep<TInput, TOutput>[],
    input: TInput
  ): Promise<{ output: TOutput | null; winningStep: string | null }> {
    for (const step of steps) {
      try {
        logger.info(`[CascadeEngine] Attempting step: ${step.name}`);
        const result = await step.execute(input);
        if (result !== null && result !== undefined) {
          logger.info(`[CascadeEngine] Step ${step.name} succeeded`);
          return { output: result, winningStep: step.name };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[CascadeEngine] Step ${step.name} failed with error: ${msg}, falling back to next step`);
      }
    }

    logger.error('[CascadeEngine] All cascade steps exhausted with null result');
    return { output: null, winningStep: null };
  }

  // Alias for backward compatibility
  public static async runCascade<TInput, TOutput>(
    steps: CascadeStep<TInput, TOutput>[],
    input: TInput
  ): Promise<{ output: TOutput | null; winningStep: string | null }> {
    return this.executeCascade(steps, input);
  }
}
