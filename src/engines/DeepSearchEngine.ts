// src/engines/DeepSearchEngine.ts
import { logger } from '../logger';

export interface SearchQueryAnalysis {
  refinedQueries: string[];
  missingEntities: string[];
  isComplete: boolean;
}

export interface DeepSearchResult<T> {
  results: T[];
  iterations: number;
  finalQuery: string;
}

export class DeepSearchEngine {
  public static analyzeSearchGaps(originalQuery: string, currentResultsCount: number): SearchQueryAnalysis {
    try {
      const words = originalQuery.trim().split(/\s+/);
      const isShort = words.length <= 2;

      const refinedQueries: string[] = [originalQuery];
      if (isShort) {
        refinedQueries.push(`${originalQuery} подробности`);
        refinedQueries.push(`${originalQuery} инструкция регламент`);
      }

      const isComplete = currentResultsCount >= 2;
      logger.info(`[DeepSearchEngine] Query analysis: "${originalQuery}", complete: ${isComplete}`);

      return {
        refinedQueries,
        missingEntities: isComplete ? [] : ['дополнительный контекст'],
        isComplete
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[DeepSearchEngine] Error analyzing query: ${msg}`);
      return { refinedQueries: [originalQuery], missingEntities: [], isComplete: true };
    }
  }

  public static async iterativeSearch<T>(
    initialQuery: string,
    searchFn: (query: string) => Promise<T[]>,
    maxIterations = 3
  ): Promise<DeepSearchResult<T>> {
    let currentQuery = initialQuery;
    let accumulatedResults: T[] = [];
    let iteration = 1;

    for (; iteration <= maxIterations; iteration++) {
      try {
        const found = await searchFn(currentQuery);
        accumulatedResults = found;
        const analysis = this.analyzeSearchGaps(currentQuery, found.length);
        if (analysis.isComplete || iteration === maxIterations) {
          break;
        }
        if (analysis.refinedQueries.length > 1) {
          currentQuery = analysis.refinedQueries[1];
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[DeepSearchEngine] Search error at iteration ${iteration}: ${msg}`);
        break;
      }
    }

    return {
      results: accumulatedResults,
      iterations: iteration,
      finalQuery: currentQuery
    };
  }
}
