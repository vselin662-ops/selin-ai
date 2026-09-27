// src/adapters/max/handlers/OwnerCommandHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { DiagnosticEngine } from '../../../engines/DiagnosticEngine';
import { AnomalyDetector } from '../../../engines/AnomalyDetector';
import { HITLEngine } from '../../../engines/HITLEngine';

export class OwnerCommandHandler implements IMessageHandler {
  public readonly name = 'OwnerCommandHandler';
  public readonly priority = 75;

  public canHandle(ctx: HandlerContext): boolean {
    if (!ctx.isOwner) return false;
    const text = ctx.lowerText;
    return (
      text.startsWith('/admin') ||
      text.startsWith('админ') ||
      text.startsWith('/broadcast') ||
      text.startsWith('/status') ||
      text.startsWith('/diagnostics')
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.lowerText;

      if (text === '/status' || text === 'статус' || text === '/diagnostics') {
        const diag = DiagnosticEngine.runDiagnostics();
        return {
          handled: true,
          replyText:
            `👑 **Панель владельца: Диагностика системы**\n\n` +
            `• Статус: **${diag.status}**\n` +
            `• Аптайм: ${diag.uptimeSeconds} сек.\n` +
            `• Память Heap: ${diag.heapUsedMb} МБ\n` +
            `• Проблемы: ${diag.issues.length > 0 ? diag.issues.join(', ') : 'Отсутствуют'}`
        };
      }

      if (text.startsWith('/broadcast')) {
        const msg = ctx.text.replace(/^\/broadcast\s*/i, '').trim();
        if (!msg) {
          return { handled: true, replyText: '⚠️ Укажите текст рассылки: `/broadcast [текст]`.' };
        }

        const hitl = HITLEngine.requestConfirmation(ctx.chatId, 'BROADCAST', `Рассылка сообщения: "${msg}"`, { msg });
        return {
          handled: true,
          replyText: `📢 Подготовлена рассылка: «${msg}».\nТребуется подтверждение операции: ID \`${hitl.actionId}\`.`,
          extra: {
            attachments: [
              {
                type: 'inline_keyboard',
                payload: {
                  buttons: [
                    [
                      { type: 'callback', text: '🚀 Запустить рассылку', payload: `approve_${hitl.actionId}` },
                      { type: 'callback', text: 'Отмена', payload: `reject_${hitl.actionId}` }
                    ]
                  ]
                }
              }
            ]
          }
        };
      }

      return {
        handled: true,
        replyText: '👑 **Команды владельца**:\n• `/status` — диагностика ядра\n• `/broadcast [текст]` — массовая рассылка'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[OwnerCommandHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
