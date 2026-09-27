// src/engines/AnomalyDetector.ts
import { logger } from '../logger';

export interface UserBehaviorMetrics {
  chatId: string;
  requestsLastMinute: number;
  lastRequestTimestamp: number;
  trustScore: number;
  consecutiveErrors: number;
}

export class AnomalyDetector {
  private static readonly userMetrics = new Map<string, UserBehaviorMetrics>();
  private static readonly RATE_LIMIT_PER_MINUTE = 40;

  public static trackRequest(chatId: string): { isSuspicious: boolean; reason?: string } {
    const now = Date.now();
    let metrics = this.userMetrics.get(chatId);

    if (!metrics) {
      metrics = {
        chatId,
        requestsLastMinute: 1,
        lastRequestTimestamp: now,
        trustScore: 100,
        consecutiveErrors: 0
      };
      this.userMetrics.set(chatId, metrics);
      return { isSuspicious: false };
    }

    if (now - metrics.lastRequestTimestamp > 60000) {
      metrics.requestsLastMinute = 1;
      metrics.lastRequestTimestamp = now;
    } else {
      metrics.requestsLastMinute++;
    }

    if (metrics.requestsLastMinute > this.RATE_LIMIT_PER_MINUTE) {
      metrics.trustScore = Math.max(0, metrics.trustScore - 20);
      logger.warn(`[AnomalyDetector] Rate anomaly detected for chat ${chatId}: ${metrics.requestsLastMinute} req/min`);
      return { isSuspicious: true, reason: 'RATE_LIMIT_EXCEEDED' };
    }

    return { isSuspicious: false };
  }

  public static recordError(chatId: string): void {
    const metrics = this.userMetrics.get(chatId);
    if (metrics) {
      metrics.consecutiveErrors++;
      if (metrics.consecutiveErrors > 5) {
        metrics.trustScore = Math.max(0, metrics.trustScore - 10);
        logger.warn(`[AnomalyDetector] Consecutive errors anomaly for chat ${chatId}`);
      }
    }
  }

  public static recordSuccess(chatId: string): void {
    const metrics = this.userMetrics.get(chatId);
    if (metrics) {
      metrics.consecutiveErrors = 0;
      metrics.trustScore = Math.min(100, metrics.trustScore + 1);
    }
  }

  public static getTrustScore(chatId: string): number {
    return this.userMetrics.get(chatId)?.trustScore ?? 100;
  }
}
