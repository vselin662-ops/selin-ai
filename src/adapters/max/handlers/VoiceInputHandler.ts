// src/adapters/max/handlers/VoiceInputHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { VoiceCascadeEngine } from '../../../engines/VoiceCascadeEngine';

export class VoiceInputHandler implements IMessageHandler {
  public readonly name = 'VoiceInputHandler';
  public readonly priority = 30;

  public canHandle(ctx: HandlerContext): boolean {
    return ctx.isVoiceInput;
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    // Пропускаем дальше по цепочке в DefaultLLMHandler для распознавания и полноценного ответа
    return { handled: false };
  }
}
