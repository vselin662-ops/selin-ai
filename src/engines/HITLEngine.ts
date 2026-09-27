// src/engines/HITLEngine.ts
import { logger } from '../logger';
import { CryptographicAudit } from './CryptographicAudit';

export interface PendingAction {
  actionId: string;
  chatId: string;
  actionType: 'PAYMENT' | 'DOCUMENT_DELETE' | 'BROADCAST' | 'SUBSCRIPTION_CHANGE';
  description: string;
  payload: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

export class HITLEngine {
  private static readonly pendingMap = new Map<string, PendingAction>();
  private static readonly TTL_MS = 15 * 60 * 1000; // 15 минут

  public static requestConfirmation(
    chatId: string,
    actionType: PendingAction['actionType'],
    description: string,
    payload: Record<string, unknown>
  ): PendingAction {
    const actionId = `hitl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();
    const action: PendingAction = {
      actionId,
      chatId,
      actionType,
      description,
      payload,
      createdAt: now,
      expiresAt: now + this.TTL_MS
    };

    this.pendingMap.set(actionId, action);
    CryptographicAudit.signAction('HITL_ACTION_CREATED', chatId, { actionId, actionType });
    logger.info(`[HITLEngine] Action created: ${actionId} for chat ${chatId} (${actionType})`);
    return action;
  }

  // Alias for backward compatibility
  public static createPendingAction(
    chatId: string,
    actionType: PendingAction['actionType'],
    description: string,
    payload: Record<string, unknown>
  ): PendingAction {
    return this.requestConfirmation(chatId, actionType, description, payload);
  }

  public static getPendingAction(actionId: string): PendingAction | null {
    const action = this.pendingMap.get(actionId);
    if (!action) return null;
    if (Date.now() > action.expiresAt) {
      this.pendingMap.delete(actionId);
      logger.warn(`[HITLEngine] Action ${actionId} expired`);
      return null;
    }
    return action;
  }

  public static approveAction(actionId: string, approverId: string): PendingAction | null {
    const action = this.getPendingAction(actionId);
    if (!action) return null;

    this.pendingMap.delete(actionId);
    CryptographicAudit.signAction('HITL_ACTION_APPROVED', approverId, { actionId, actionType: action.actionType });
    logger.info(`[HITLEngine] Action ${actionId} APPROVED by ${approverId}`);
    return action;
  }

  public static rejectAction(actionId: string, rejectorId: string): boolean {
    const action = this.pendingMap.get(actionId);
    if (!action) return false;

    this.pendingMap.delete(actionId);
    CryptographicAudit.signAction('HITL_ACTION_REJECTED', rejectorId, { actionId });
    logger.info(`[HITLEngine] Action ${actionId} REJECTED by ${rejectorId}`);
    return true;
  }
}
