// src/adapters/max/handlers/VoiceModeHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { setVoiceModePreference, setVoiceGender } from '../../../../db';

export class VoiceModeHandler implements IMessageHandler {
  public readonly name = 'VoiceModeHandler';
  public readonly priority = 35;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text === 'голос вкл' ||
      text === 'голос выкл' ||
      text === '/voice on' ||
      text === '/voice off' ||
      text === 'голос мужской' ||
      text === 'голос женский' ||
      text === 'селин777' ||
      text === 'селин000'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.lowerText;

      if (text === 'голос вкл' || text === '/voice on' || text === 'селин777') {
        setVoiceModePreference(ctx.chatId, 'voice');
        if (text === 'селин777') {
          setVoiceGender(ctx.chatId, 'male', 1);
        }
        return {
          handled: true,
          replyText: '🔊 Голосовые ответы включены (Режим: Активен).',
          voiceText: 'Голосовые ответы включены.'
        };
      }

      if (text === 'голос выкл' || text === '/voice off' || text === 'селин000') {
        setVoiceModePreference(ctx.chatId, 'text');
        if (text === 'селин000') {
          setVoiceGender(ctx.chatId, 'female', 1);
        }
        return {
          handled: true,
          replyText: '🔇 Голосовые ответы отключены (Режим: Текст).'
        };
      }

      if (text === 'голос мужской') {
        setVoiceGender(ctx.chatId, 'male', 1);
        return {
          handled: true,
          replyText: '🎙 Установлен мужской голос озвучивания (Дмитрий).',
          voiceText: 'Установлен мужской голос.'
        };
      }

      if (text === 'голос женский') {
        setVoiceGender(ctx.chatId, 'female', 1);
        return {
          handled: true,
          replyText: '🎙 Установлен женский голос озвучивания (Светлана).',
          voiceText: 'Установлен женский голос.'
        };
      }

      return { handled: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[VoiceModeHandler] Error handling voice mode: ${msg}`);
      return { handled: false };
    }
  }
}
