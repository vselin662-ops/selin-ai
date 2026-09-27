// src/engines/BatchProcessor.ts
import { logger } from '../logger';

export interface BatchOptions {
  batchSize: number;
  delayMs?: number;
}

export class BatchProcessor {
  public static async processItems<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    options: BatchOptions
  ): Promise<R[]> {
    const { batchSize, delayMs = 0 } = options;
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      logger.info(`[BatchProcessor] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`);

      const batchResults = await Promise.all(
        batch.map((item, indexWithinBatch) => processor(item, i + indexWithinBatch))
      );
      results.push(...batchResults);

      if (delayMs > 0 && i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}
