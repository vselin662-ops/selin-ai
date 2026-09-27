// src/engines/PaymentPipelineEngine.ts
import { logger } from '../logger';
import { HITLEngine } from './HITLEngine';
import { getSubscription } from '../fintech/subscriptions';

export interface PaymentInitResult {
  requiresConfirmation: boolean;
  actionId?: string;
  paymentUrl?: string;
  tariffName: string;
  amountRub: number;
}

export class PaymentPipelineEngine {
  public static initSubscriptionPayment(chatId: string, tariff: 'MONTHLY' | 'YEARLY' = 'MONTHLY'): PaymentInitResult {
    try {
      const amountRub = tariff === 'MONTHLY' ? 490 : 4900;
      const tariffName = tariff === 'MONTHLY' ? 'Премиум 30 дней' : 'Премиум 365 дней';

      const hitlAction = HITLEngine.createPendingAction(
        chatId,
        'PAYMENT',
        `Оплата подписки: ${tariffName} (${amountRub} ₽)`,
        { tariff, amountRub }
      );

      logger.info(`[PaymentPipelineEngine] Payment initialized with HITL guard for chat ${chatId}: action ${hitlAction.actionId}`);

      return {
        requiresConfirmation: true,
        actionId: hitlAction.actionId,
        tariffName,
        amountRub
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[PaymentPipelineEngine] Payment init failed: ${msg}`);
      throw new Error(`Payment initiation failed: ${msg}`);
    }
  }

  public static checkUserSubscriptionStatus(chatId: string): { isPaid: boolean; expiresAt?: string } {
    const sub = getSubscription(chatId);
    if (!sub || !sub.paid_until) {
      return { isPaid: false };
    }
    const isPaid = new Date(sub.paid_until).getTime() > Date.now();
    return { isPaid, expiresAt: sub.paid_until };
  }
}
