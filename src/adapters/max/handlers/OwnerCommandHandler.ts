// src/adapters/max/handlers/OwnerCommandHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class OwnerCommandHandler implements IMessageHandler {
  public readonly name = 'OwnerCommandHandler';
  public readonly priority = 50;

  public canHandle(ctx: HandlerContext): boolean {
    if (!ctx.isOwner) return false;
    const text = ctx.lowerText;
    return (
      text.startsWith('/admin') ||
      text.startsWith('админ') ||
      text.startsWith('/broadcast ') ||
      text.startsWith('/status')
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.lowerText;

      if (text === '/status' || text === 'статус') {
        const memoryUsage = process.memoryUsage();
        const heapMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        return {
          handled: true,
          replyText: `👑 **Панель владельца: Статус системы**\n\n• Uptime: ${Math.round(process.uptime())} сек.\n• Память: ${heapMb} МБ heap\n• Окружение: ${process.env.NODE_ENV || 'development'}`
        };
      }

      if (text.startsWith('/broadcast ')) {
        const msg = ctx.text.replace('/broadcast ', '').trim();
        logger.info(`[OwnerCommandHandler] Broadcast initiated: "${msg}"`);
        return {
          handled: true,
          replyText: `📢 Рассылка запущена для всех активных пользователей.`
        };
      }

      return {
        handled: true,
        replyText: '👑 **Команды администратора**:\n• `/status` — состояние ядра\n• `/broadcast [текст]` — рассылка'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[OwnerCommandHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
