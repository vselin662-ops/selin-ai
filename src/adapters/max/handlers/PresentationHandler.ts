// src/adapters/max/handlers/PresentationHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { HITLEngine } from '../../../engines/HITLEngine';
import { SelfCorrectionEngine } from '../../../engines/SelfCorrectionEngine';

export class PresentationHandler implements IMessageHandler {
  public readonly name = 'PresentationHandler';
  public readonly priority = 55;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text.startsWith('презентация:') || text.startsWith('сделай презентацию') || text.startsWith('/presentation');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const topic = ctx.text.replace(/^(?:презентация:?|сделай презентацию|\/presentation)\s*/i, '').trim();
      if (!topic) {
        return {
          handled: true,
          replyText: '📊 Укажите тему презентации. Например: «презентация: Искусственный интеллект в медицине».'
        };
      }

      logger.info(`[PresentationHandler] Generating presentation structure for chat ${ctx.chatId}, topic: "${topic}"`);

      const slides = [
        `1. Введение: ${topic}`,
        '2. Текущее состояние и ключевые метрики',
        '3. Вызовы и точки роста',
        '4. Стратегический план реализации',
        '5. Заключение и выводы'
      ];

      const reply =
        `📊 **Презентация по теме: «${topic}» подготовлена!**\n\n` +
        `**Структура слайдов:**\n${slides.join('\n')}\n\n` +
        `Для генерации файлов PPTX и PDF нажмите кнопку согласования.`;

      return {
        handled: true,
        replyText: reply,
        voiceText: `Презентация по теме ${topic} сформирована.`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[PresentationHandler] Error generating presentation: ${msg}`);
      return { handled: false };
    }
  }
}
