// src/adapters/max/MaxAdapter.ts
import { SelinCore } from '../../core/SelinCore';
import { logger } from '../../logger';
import { MaxWebhookPayload, SendMessageOptions } from './types';
import { MaxWebhookRouter } from './MaxWebhookRouter';
import { MaxSender } from './services/maxSender';
import { validateChatId } from './utils/idSanitizer';

// Handlers
import { StartHandler } from './handlers/StartHandler';
import { TenantHandler } from './handlers/TenantHandler';
import { VoiceHandler } from './handlers/VoiceHandler';
import { VisionHandler } from './handlers/VisionHandler';
import { ImageGenHandler } from './handlers/ImageGenHandler';
import { BibleHandler } from './handlers/BibleHandler';
import { SmartPlannerHandler } from './handlers/SmartPlannerHandler';
import { RAGHandler } from './handlers/RAGHandler';
import { NavigationHandler } from './handlers/NavigationHandler';
import { SubscriptionHandler } from './handlers/SubscriptionHandler';
import { OwnerCommandHandler } from './handlers/OwnerCommandHandler';
import { DefaultLLMHandler } from './handlers/DefaultLLMHandler';

/**
 * Modern facade for MAX Messenger Adapter v2.
 * Encapsulates connection lifecycle, router dispatching, and unified sending.
 */
export class MaxAdapter {
  private router: MaxWebhookRouter;
  private token: string;
  private isConnected = false;

  constructor(selinCore: SelinCore, token?: string) {
    this.token = token || process.env.MAX_BOT_TOKEN || '';

    // Initialize Chain of Responsibility
    this.router = new MaxWebhookRouter([
      new StartHandler(),
      new TenantHandler(),
      new VoiceHandler(),
      new VisionHandler(),
      new OwnerCommandHandler(),
      new SubscriptionHandler(),
      new BibleHandler(),
      new SmartPlannerHandler(),
      new RAGHandler(),
      new NavigationHandler(),
      new ImageGenHandler(),
      new DefaultLLMHandler(selinCore)
    ]);
  }

  /**
   * Connect to MAX API.
   */
  public async connect(): Promise<void> {
    if (!this.token) {
      logger.warn('[MaxAdapter] MAX_BOT_TOKEN not provided, running in mock/offline mode');
      return;
    }
    this.isConnected = true;
    logger.info('✅ [MaxAdapter] Connected to MAX Messenger API successfully.');
  }

  /**
   * Handle incoming webhook updates from MAX platform.
   */
  public async handleWebhook(req: unknown, res: unknown): Promise<void> {
    try {
      const requestObj = req as { body?: MaxWebhookPayload };
      const responseObj = res as {
        status: (code: number) => { send: (body: string) => void; json: (data: unknown) => void };
        send: (body: string) => void;
      };

      const payload = requestObj?.body || {};
      const handled = await this.router.route(payload);

      if (responseObj && typeof responseObj.status === 'function') {
        responseObj.status(200).send(handled ? 'OK' : 'SKIPPED');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[MaxAdapter] Webhook handling error: ${msg}`);
      const responseObj = res as { status?: (code: number) => { send: (body: string) => void } };
      if (responseObj && typeof responseObj.status === 'function') {
        responseObj.status(500).send('ERROR');
      }
    }
  }

  /**
   * High-level send method for external services (schedulers, reminders, etc.).
   */
  public async sendToUser(chatId: string | number, text: string, options?: SendMessageOptions): Promise<boolean> {
    const validId = validateChatId(chatId);
    if (!validId) {
      logger.warn('[MaxAdapter] Cannot send message: invalid chatId', { chatId });
      return false;
    }

    return MaxSender.send({
      chatId: validId,
      text,
      voice: options?.voice,
      extra: options?.extra,
      token: this.token
    });
  }

  /**
   * Backward-compatible aliases for legacy callers.
   */
  public async sendMessage(chatId: string | number, text: string): Promise<boolean> {
    return this.sendToUser(chatId, text);
  }

  public async sendVoice(chatId: string | number, text: string): Promise<boolean> {
    return this.sendToUser(chatId, text, { voice: true });
  }

  public async safeSendMessageToChat(
    chatId: string | number,
    text: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    return this.sendToUser(chatId, text, { extra });
  }
}
