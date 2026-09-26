// src/adapters/max/handlers/TenantHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class TenantHandler implements IMessageHandler {
  public readonly name = 'TenantHandler';
  public readonly priority = 20;

  public canHandle(ctx: HandlerContext): boolean {
    return ctx.lowerText.startsWith('/tenant ') || ctx.lowerText.startsWith('терент ');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const parts = ctx.text.trim().split(/\s+/);
      const tenantKey = parts[1] || 'default';

      logger.info(`[TenantHandler] Switched tenant context for chat ${ctx.chatId} to ${tenantKey}`);
      return {
        handled: true,
        replyText: `🏢 Текущая организация переключена на: **${tenantKey}**`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[TenantHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
