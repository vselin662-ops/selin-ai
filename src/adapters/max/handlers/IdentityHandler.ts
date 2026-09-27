// src/adapters/max/handlers/IdentityHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class IdentityHandler implements IMessageHandler {
  public readonly name = 'IdentityHandler';
  public readonly priority = 125;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text === 'кто ты' ||
      text === 'кто твой создатель' ||
      text === 'пол модели' ||
      text === 'кто создатель' ||
      text === 'инфо'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const reply =
        `🤖 **Я — Селин (Selin AI Sovereign Mega Brain)**.\n\n` +
        `• **Архитектура**: Суверенная мультиагентная система когнитивной трансформации.\n` +
        `• **Платформа**: MAX Messenger API v2, Node.js + TypeScript, Ollama (Qwen 2.5).\n` +
        `• **Безопасность**: Zero-Trust, Model Armor, Cryptographic Audit.\n` +
        `• **Миссия**: Надежный персональный помощник в планировании, документах и духовном росте.`;

      return {
        handled: true,
        replyText: reply,
        voiceText: 'Я Селин, ваш персональный суверенный ИИ-ассистент.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[IdentityHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
