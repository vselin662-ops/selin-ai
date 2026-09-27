// src/adapters/max/handlers/DefaultLLMHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { SelinCore } from '../../../core/SelinCore';
import { ChannelType } from '../../../core/types';

export class DefaultLLMHandler implements IMessageHandler {
  public readonly name = 'DefaultLLMHandler';
  public readonly priority = 999;
  private selinCore: SelinCore;

  constructor(selinCore: SelinCore) {
    this.selinCore = selinCore;
  }

  public canHandle(ctx: HandlerContext): boolean {
    // Catch-all handler for general AI chat dialogue
    return Boolean(ctx.text && ctx.text.trim().length > 0);
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      logger.info(`[DefaultLLMHandler] Delegating text to SelinCore for chat ${ctx.chatId}`);
      const response = await this.selinCore.processMessage(ctx.text, {
        chatId: ctx.chatId,
        channel: ChannelType.MAX,
        isVoice: ctx.isVoiceInput
      });

      const replyText = response?.text || 'Извините, не удалось сформировать ответ.';
      return {
        handled: true,
        replyText,
        voiceText: replyText
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[DefaultLLMHandler] Error in LLM processing: ${msg}`);
      return {
        handled: true,
        replyText: '⚠️ Произошла ошибка при обработке запроса ИИ-ядром.'
      };
    }
  }
}
