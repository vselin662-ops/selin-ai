// src/adapters/max/MaxWebhookRouter.ts
import { IMessageHandler, HandlerContext, HandlerResult, MaxWebhookPayload } from './types';
import { validateChatId, parseNumericId } from './utils/idSanitizer';
import { parseAttachments } from './utils/attachmentParser';
import { DeduplicationStore } from './services/DeduplicationStore';
import { MaxSender } from './services/maxSender';
import { logger } from '../../logger';
import { isOwner as checkIsOwner } from '../../fintech/subscriptions';

export class MaxWebhookRouter {
  private handlers: IMessageHandler[] = [];

  constructor(handlers: IMessageHandler[] = []) {
    // Register and sort handlers ascending by priority
    this.handlers = [...handlers].sort((a, b) => a.priority - b.priority);
  }

  public registerHandler(handler: IMessageHandler): void {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Main router entry point: builds context, deduplicates, and executes chain.
   */
  public async route(payload: MaxWebhookPayload): Promise<boolean> {
    const p = payload as any;
    const rawMid =
      p.message?.body?.mid ||
      p.body?.message?.body?.mid ||
      p.message?.body?.seq ||
      p.mid ||
      p.body?.mid ||
      p.body?.seq ||
      p.message?.mid ||
      '';
    const messageId = String(rawMid).trim();

    // 1. Deduplication Check (только для обычных текстовых сообщений, НЕ для callback-кликов!)
    const isCallback = Boolean(
      p.callback_id ||
      p.callback_data ||
      p.body?.callback_id ||
      p.type === 'callback' ||
      p.event === 'callback'
    );

    if (messageId && !isCallback) {
      const isDupe = await DeduplicationStore.isDuplicate(messageId);
      if (isDupe) {
        logger.info(`[MaxWebhookRouter] Duplicate message ignored: ${messageId}`);
        return true;
      }
    }

    // 2. Extract and validate chatId
    const rawChatId =
      p.message?.recipient?.chat_id ||
      p.body?.message?.recipient?.chat_id ||
      p.recipient?.chat_id ||
      p.chat_id ||
      p.user_id ||
      p.body?.user?.user_id ||
      p.body?.user?.id ||
      p.body?.sender?.user_id ||
      p.body?.sender?.id ||
      p.body?.message?.sender?.user_id ||
      p.body?.message?.sender?.id ||
      p.message?.sender?.user_id ||
      p.message?.sender?.id ||
      '';

    let chatId = '';
    try {
      chatId = validateChatId(rawChatId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[MaxWebhookRouter] Invalid chatId in payload: ${msg}`, { rawChatId });
      return false;
    }

    // 3. Extract text
    const rawText =
      p.message?.body?.text ||
      p.body?.message?.body?.text ||
      p.body?.text ||
      p.body?.message?.text ||
      p.message?.text ||
      (p.update_type === 'bot_started' ? '/start' : '') ||
      p.callback_data ||
      p.body?.payload ||
      p.payload?.payload ||
      p.payload?.data ||
      '';
    const text = typeof rawText === 'string' ? rawText.trim() : '';

    // 4. Parse attachments
    const attachments = parseAttachments(payload);

    // 4.5. Extract callback data from all MAX API variations
    const rawCallbackData =
      payload.callback_data ||
      payload.body?.callback_data ||
      payload.body?.payload ||
      payload.payload?.payload ||
      payload.payload?.data ||
      payload.data ||
      (payload.type === 'callback' ? payload.payload : undefined) ||
      (payload.event === 'callback' ? payload.payload : undefined) ||
      undefined;
    const callbackDataStr = typeof rawCallbackData === 'string' ? rawCallbackData.trim() : undefined;

    // 5. Build HandlerContext
    const context: HandlerContext = {
      raw: payload,
      chatId,
      numericId: parseNumericId(chatId),
      text,
      lowerText: text.toLowerCase(),
      isVoiceInput: attachments.hasAudio,
      isOwner: checkIsOwner(chatId),
      hasImage: attachments.hasImage,
      imageUrl: attachments.imageUrl,
      hasLocation: attachments.hasLocation,
      userLat: attachments.latitude,
      userLon: attachments.longitude,
      callbackData: callbackDataStr,
      isCallbackUpdate: Boolean(
        payload.callback_id ||
        payload.callback_data ||
        payload.body?.callback_id ||
        payload.body?.callback_data ||
        payload.type === 'callback' ||
        payload.event === 'callback' ||
        callbackDataStr
      )
    };

    // 6. Chain of Responsibility execution
    for (const handler of this.handlers) {
      try {
        if (handler.canHandle(context)) {
          logger.info(`[MaxWebhookRouter] Handler [${handler.name}] matched for chat ${chatId}`);
          const result: HandlerResult = await handler.handle(context);

          if (result.handled) {
            if (result.replyText || result.voiceText || result.extra) {
              await MaxSender.send({
                chatId,
                text: result.replyText,
                voice: Boolean(result.voiceText || context.isVoiceInput),
                extra: result.extra
              });
            }
            return true;
          }
          // Если handler вернул handled: false, продолжаем цепочку к DefaultLLMHandler
        }
      } catch (handlerErr: unknown) {
        const msg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
        logger.error(`[MaxWebhookRouter] Error executing handler [${handler.name}]: ${msg}`);
      }
    }

    logger.warn(`[MaxWebhookRouter] No handler processed update for chat ${chatId}`);
    return false;
  }
}
