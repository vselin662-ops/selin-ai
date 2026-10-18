// src/engines/SemanticGovernance.ts
import { logger } from '../logger';

export interface GovernanceResult {
  allowed: boolean;
  intent: string;
  confidence: number;
  reason?: string;
}

export class SemanticGovernance {
  private static readonly RESTRICTED_TOPICS: { topic: string; regex: RegExp; reason: string }[] = [
    {
      topic: 'MALICIOUS_CODE',
      regex: /(напиши\s+(эксплойт|вирус|троян)|создай\s+ddos|взломай\s+сервер)/i,
      reason: 'Запрос содержит вредоносные намерения'
    },
    {
      topic: 'BYPASS_SECURITY',
      regex: /(отключи\s+защиту|обойди\s+фаервол|дамп\s+паролей)/i,
      reason: 'Попытка обхода механизмов безопасности'
    }
  ];

  public static evaluateIntent(prompt: string, context?: Record<string, unknown>): GovernanceResult {
    try {
      for (const restricted of this.RESTRICTED_TOPICS) {
        if (restricted.regex.test(prompt)) {
          logger.warn(`[SemanticGovernance] Blocked intent: ${restricted.topic} in prompt: "${prompt}"`);
          return {
            allowed: false,
            intent: restricted.topic,
            confidence: 0.98,
            reason: restricted.reason
          };
        }
      }

      return {
        allowed: true,
        intent: 'BENIGN_USER_PROMPT',
        confidence: 0.99
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[SemanticGovernance] Evaluation error: ${msg}`);
      return { allowed: false, intent: 'ERROR', confidence: 0, reason: msg };
    }
  }
}
