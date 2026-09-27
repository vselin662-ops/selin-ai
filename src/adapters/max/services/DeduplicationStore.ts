// src/adapters/max/services/DeduplicationStore.ts
import { redisService } from '../../../services/RedisService';
import { logger } from '../../../logger';

const IN_MEMORY_DEDUP = new Map<string, number>();
const TTL_SECONDS = 600; // 10 minutes deduplication window

/**
 * DeduplicationStore: checks if a message/update ID has already been processed.
 * Uses Redis with fallback to in-memory Map with automatic TTL cleanup.
 */
export class DeduplicationStore {
  public static async isDuplicate(key: string): Promise<boolean> {
    if (!key) return false;

    // 1. Try Redis first
    try {
      const redisClient = redisService.getClient();
      if (redisClient && redisService.isReady()) {
        const fullKey = `max:dedup:${key}`;
        const setRes = await redisClient.set(fullKey, '1', 'EX', TTL_SECONDS, 'NX');
        // 'OK' means key was newly set, null means already existed
        return setRes === null;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[DeduplicationStore] Redis dedup check error: ${msg}, falling back to memory`);
    }

    // 2. In-Memory fallback
    const now = Date.now();
    const existing = IN_MEMORY_DEDUP.get(key);
    if (existing && now - existing < TTL_SECONDS * 1000) {
      return true;
    }

    IN_MEMORY_DEDUP.set(key, now);

    // Evict old entries if Map gets too big
    if (IN_MEMORY_DEDUP.size > 2000) {
      for (const [k, ts] of IN_MEMORY_DEDUP.entries()) {
        if (now - ts > TTL_SECONDS * 1000) {
          IN_MEMORY_DEDUP.delete(k);
        }
      }
    }

    return false;
  }

  public static async markProcessed(key: string): Promise<void> {
    await this.isDuplicate(key);
  }

  public static async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [k, ts] of IN_MEMORY_DEDUP.entries()) {
      if (now - ts > TTL_SECONDS * 1000) {
        IN_MEMORY_DEDUP.delete(k);
      }
    }
  }
}
