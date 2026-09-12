import { logger } from '../logger';
import { synthesizeForChat } from '../services/TTSService';
import { AgentOrchestrator } from '../core/AgentOrchestrator';
import { MessageContext, ChannelType } from '../core/types';

export class TelegramAdapter {
  private token: string;
  private webhookSecret: string;
  private orchestrator: AgentOrchestrator;
  private baseUrl: string;

  constructor(orchestrator: AgentOrchestrator) {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    this.orchestrator = orchestrator;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
    logger.info(`[Telegram] env check token=${Boolean(this.token)} secret=${Boolean(this.webhookSecret)} public=${process.env.PUBLIC_URL || 'none'}`);
  }

  async registerWebhook(): Promise<void> {
    if (!this.token) {
      logger.warn('[Telegram] TELEGRAM_BOT_TOKEN not set, skipping webhook registration');
      return;
    }
    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) {
      logger.warn('[Telegram] PUBLIC_URL not set, skipping webhook registration');
      return;
    }
    const webhookUrl = `${publicUrl}/api/telegram/webhook`;
    try {
      const res = await fetch(`${this.baseUrl}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, secret_token: this.webhookSecret, allowed_updates: ['message'] })
      });
      const data = await res.json();
      if (data.ok) {
        logger.info(`[Telegram] Webhook registered: ${webhookUrl}`);
        const infoRes = await fetch(`${this.baseUrl}/getWebhookInfo`);
        const info = await infoRes.json();
        logger.info(`[Telegram] webhook_url=${info?.result?.url || 'none'} pending=${info?.result?.pending_update_count ?? -1}`);
      } else {
        logger.error('[Telegram] setWebhook failed:', JSON.stringify(data));
      }
    } catch (err: any) {
      logger.error('[Telegram] Webhook registration error:', err?.message || err);
    }
  }

  async handleWebhook(req: any, res: any): Promise<void> {
    if (this.webhookSecret) {
      const secret = req.headers['x-telegram-bot-api-secret-token'];
      if (secret !== this.webhookSecret) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    try {
      const update = req.body;
      const message = update?.message;
      if (!message) return res.status(200).json({ ok: true });
      const chatId = String(message.chat?.id || '');
      if (!chatId) return res.status(200).json({ ok: true });
      let userText = '';
      let isVoice = false;
      if (message.text) userText = message.text;
      else if (message.voice) { isVoice = true; userText = '[голосовое сообщение]'; }
      else if (message.photo) userText = '[фото]';
      if (!userText) return res.status(200).json({ ok: true });
      const context: MessageContext = {
        chatId, tenantId: `tg_${chatId}`, channel: ChannelType.TELEGRAM, isVoice, timestamp: Date.now()
      };
      const aiResponse = await this.orchestrator.processMessage(userText, context);
      await this.sendMessage(chatId, aiResponse.text);
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      logger.error('[Telegram] Webhook error:', err?.message || err);
      return res.status(200).json({ ok: true });
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000) })
      });
    } catch (err: any) {
      logger.error('[Telegram] sendMessage error:', err?.message || err);
    }
  }
}
