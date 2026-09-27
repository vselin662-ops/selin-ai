// src/adapters/max/utils/semanticGuard.ts
import { ModelArmor } from '../../../engines/ModelArmor';
import { SemanticGovernance } from '../../../engines/SemanticGovernance';
import { AnomalyDetector } from '../../../engines/AnomalyDetector';
import { logger } from '../../../logger';

export interface GuardVerificationResult {
  allowed: boolean;
  sanitizedText: string;
  blockReason?: string;
}

export function verifyMessageSemantics(chatId: string, rawText: string): GuardVerificationResult {
  try {
    // 1. Поведенческий анализ аномалий
    const anomaly = AnomalyDetector.trackRequest(chatId);
    if (anomaly.isSuspicious) {
      return {
        allowed: false,
        sanitizedText: '',
        blockReason: 'Превышен лимит запросов. Подождите одну минуту.'
      };
    }

    // 2. Семантическая проверка намерений
    const governance = SemanticGovernance.evaluateIntent(rawText);
    if (!governance.allowed) {
      AnomalyDetector.recordError(chatId);
      return {
        allowed: false,
        sanitizedText: '',
        blockReason: governance.reason || 'Запрос отклонён политикой безопасности.'
      };
    }

    // 3. Сканирование ModelArmor на инъекции и утечки
    const scan = ModelArmor.inspectInput(rawText);
    if (!scan.passed) {
      AnomalyDetector.recordError(chatId);
      return {
        allowed: false,
        sanitizedText: '',
        blockReason: 'Запрос содержит недопустимые управляющие инструкции.'
      };
    }

    AnomalyDetector.recordSuccess(chatId);
    return {
      allowed: true,
      sanitizedText: scan.sanitizedText
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[semanticGuard] Verification error for chat ${chatId}: ${msg}`);
    return {
      allowed: false,
      sanitizedText: '',
      blockReason: 'Внутренняя ошибка проверки безопасности.'
    };
  }
}
