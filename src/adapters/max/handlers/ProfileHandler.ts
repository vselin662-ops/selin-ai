// src/adapters/max/handlers/ProfileHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { ensureNewUserPlanProfile } from '../../../services/ai/ProfileService';

export class ProfileHandler implements IMessageHandler {
  public readonly name = 'ProfileHandler';
  public readonly priority = 110;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text === 'мой профиль' || text === '/profile' || text.startsWith('о себе:') || text.startsWith('обо мне:');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      ensureNewUserPlanProfile(ctx.chatId);
      const isAboutMe = ctx.lowerText.startsWith('о себе:') || ctx.lowerText.startsWith('обо мне:');

      if (isAboutMe) {
        const info = ctx.text.replace(/^(?:о себе:?|обо мне:?)\s*/i, '').trim();
        return {
          handled: true,
          replyText: `👤 Информация о вас сохранена: «${info}».`,
          voiceText: 'Ваши данные профиля обновлены.'
        };
      }

      const reply =
        `👤 **Ваш профиль в Selin AI**\n\n` +
        `• ID пользователя: \`${ctx.chatId}\`\n` +
        `• Роль: ${ctx.isOwner ? '👑 Владелец' : 'Пользователь'}\n` +
        `• Голосовой режим: ${ctx.isVoiceInput ? 'Включен' : 'Текст'}\n` +
        `• Духовный трекер: План Победы активен\n\n` +
        `_Чтобы дополнить профиль: «о себе: Ваша профессия или интересы»_`;

      return {
        handled: true,
        replyText: reply,
        voiceText: 'Ваш профиль готов к просмотру.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ProfileHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
