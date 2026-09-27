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
    const rawMid =
      payload.mid ||
      payload.body?.mid ||
      payload.body?.seq ||
      payload.message?.mid ||
      '';
    const messageId = String(rawMid).trim();

    // 1. Deduplication Check
    if (messageId) {
      const isDupe = await DeduplicationStore.isDuplicate(messageId);
      if (isDupe) {
        logger.info(`[MaxWebhookRouter] Duplicate message ignored: ${messageId}`);
        return true;
      }
    }

    // 2. Extract and validate chatId
    const rawChatId =
      payload.message?.recipient?.chat_id ||
      payload.body?.message?.recipient?.chat_id ||
      payload.recipient?.chat_id ||
      payload.chat_id ||
      payload.user_id ||
      payload.body?.user?.user_id ||
      payload.body?.user?.id ||
      payload.body?.sender?.user_id ||
      payload.body?.sender?.id ||
      payload.body?.message?.sender?.user_id ||
      payload.body?.message?.sender?.id ||
      payload.message?.sender?.user_id ||
      payload.message?.sender?.id ||
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
      payload.body?.text ||
      payload.body?.message?.text ||
      payload.message?.text ||
      payload.callback_data ||
      payload.body?.payload ||
      payload.payload?.payload ||
      payload.payload?.data ||
      '';
    const text = typeof rawText === 'string' ? rawText.trim() : '';

    // 4. Parse attachments
    const attachments = parseAttachments(payload);

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
      callbackData: typeof payload.callback_data === 'string' ? payload.callback_data : undefined,
      isCallbackUpdate: Boolean(payload.callback_id || payload.callback_data || payload.body?.callback_id)
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
          }
          // БАГ 1: Прерываем выполнение цепочки СРАЗУ после первого совпадения,
          // независимо от результата handler.handle(context).
          return true;
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
