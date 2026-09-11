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
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: this.webhookSecret,
          allowed_updates: ['message']
        })
      });
      const data = await res.json();
      if (data.ok) {
        logger.info(`[Telegram] Webhook registered: ${webhookUrl}`);
      } else {
        logger.error('[Telegram] setWebhook failed:', data);
      }
    } catch (err: any) {
      logger.error('[Telegram] Webhook registration error:', err);
    }
  }

  async handleWebhook(req: any, res: any): Promise<void> {
    if (this.webhookSecret) {
      const secret = req.headers['x-telegram-bot-api-secret-token'];
      if (secret !== this.webhookSecret) {
        logger.warn('[Telegram] Invalid secret token');
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

      if (message.text) {
        userText = message.text;
      } else if (message.voice) {
        isVoice = true;
        userText = await this.downloadAndTranscribe(message.voice.file_id, chatId);
      } else if (message.photo) {
        userText = '[Пользователь отправил фото]';
      }

      if (!userText) return res.status(200).json({ ok: true });

      const context: MessageContext = {
        chatId,
        tenantId: `tg_${chatId}`,
        channel: ChannelType.TELEGRAM,
        isVoice,
        timestamp: Date.now()
      };

      const aiResponse = await this.orchestrator.processMessage(userText, context);
      await this.sendMessage(chatId, aiResponse.text);

      if (isVoice) {
        const audioBuffer = await synthesizeForChat(chatId, aiResponse.text);
        await this.sendVoice(chatId, audioBuffer);
      }

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      logger.error('[Telegram] Webhook error:', err);
      return res.status(200).json({ ok: true });
    }
  }

  private async downloadAndTranscribe(fileId: string, chatId: string): Promise<string> {
    try {
      const fileRes = await fetch(`${this.baseUrl}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();
      if (!fileData.ok) return '[Не удалось загрузить голосовое]';

      const filePath = fileData.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
      const audioRes = await fetch(fileUrl);
      const audioBuffer = await audioRes.arrayBuffer();

      const sttService = (global as any).sttService;
      if (sttService && typeof sttService.transcribe === 'function') {
        return await sttService.transcribe(Buffer.from(audioBuffer), 'ogg');
      }
      return '[Голосовые пока не поддерживаются]';
    } catch (err: any) {
      logger.error('[Telegram] Voice transcribe error:', err);
      return '[Ошибка обработки голоса]';
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
      });
    } catch (err: any) {
      logger.error('[Telegram] sendMessage error:', err);
    }
  }

  async sendVoice(chatId: string, audioBuffer: Buffer): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('voice', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voice.ogg');
      await fetch(`${this.baseUrl}/sendVoice`, { method: 'POST', body: formData });
    } catch (err: any) {
      logger.error('[Telegram] sendVoice error:', err);
    }
  }
}
