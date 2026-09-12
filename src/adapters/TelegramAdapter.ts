import { logger } from '../logger';
import { synthesizeForChat } from '../services/TTSService';
import { AgentOrchestrator } from '../core/AgentOrchestrator';
import { MessageContext, ChannelType } from '../core/types';

export class TelegramAdapter {
  private token: string;
  private webhookSecret: string;
  private orchestrator: AgentOrchestrator;
  private baseUrl: string;
  public status: string = 'initializing';

  constructor(orchestrator: AgentOrchestrator) {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    this.orchestrator = orchestrator;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async registerWebhook(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const publicUrl = process.env.PUBLIC_URL;

    let firstMissing: string | null = null;
    if (!token) {
      logger.warn('[Telegram] MISSING_VAR: TELEGRAM_BOT_TOKEN');
      console.warn('[Telegram] MISSING_VAR: TELEGRAM_BOT_TOKEN');
      if (!firstMissing) firstMissing = 'TELEGRAM_BOT_TOKEN';
    }
    if (!webhookSecret) {
      logger.warn('[Telegram] MISSING_VAR: TELEGRAM_WEBHOOK_SECRET');
      console.warn('[Telegram] MISSING_VAR: TELEGRAM_WEBHOOK_SECRET');
      if (!firstMissing) firstMissing = 'TELEGRAM_WEBHOOK_SECRET';
    }
    if (!publicUrl) {
      logger.warn('[Telegram] MISSING_VAR: PUBLIC_URL');
      console.warn('[Telegram] MISSING_VAR: PUBLIC_URL');
      if (!firstMissing) firstMissing = 'PUBLIC_URL';
    }

    if (firstMissing) {
      this.status = `missing_var:${firstMissing}`;
      return;
    }

    this.token = token!;
    this.webhookSecret = webhookSecret!;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;

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
      if (!data.ok) {
        logger.error('[Telegram] setWebhook failed:', data);
        this.status = `webhook_failed:${data.description || 'unknown'}`;
        return;
      }

      const infoRes = await fetch(`${this.baseUrl}/getWebhookInfo`);
      const infoData = await infoRes.json();
      const reportedUrl = infoData.result?.url || webhookUrl;
      const pendingCount = infoData.result?.pending_update_count ?? 0;
      const logLine = `[Telegram] webhook_url=${reportedUrl} pending_count=${pendingCount}`;
      logger.info(logLine);
      console.log(logLine);

      this.status = 'working';
    } catch (err: any) {
      logger.error('[Telegram] Webhook registration error:', err);
      this.status = `webhook_failed:${err?.message || String(err)}`;
    }
  }

  async handleWebhook(req: any, res: any): Promise<void> {
    const expectedSecret = this.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret) {
      const secret = req.headers['x-telegram-bot-api-secret-token'];
      if (secret !== expectedSecret) {
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
        const transcribed = await this.downloadAndTranscribe(message.voice.file_id, chatId);
        if (!transcribed) {
          await this.sendMessage(chatId, 'Голосовые пока не доступны');
          return res.status(200).json({ ok: true });
        }
        userText = transcribed;
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
        try {
          const audioBuffer = await synthesizeForChat(chatId, aiResponse.text);
          if (audioBuffer && audioBuffer.length > 0) {
            await this.sendVoice(chatId, audioBuffer);
          }
        } catch (ttsErr) {
          logger.warn('[Telegram] Voice synthesis failed:', ttsErr);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      logger.error('[Telegram] Webhook error:', err);
      return res.status(200).json({ ok: true });
    }
  }

  private async downloadAndTranscribe(fileId: string, chatId: string): Promise<string | null> {
    try {
      const sttService = (global as any).sttService;
      if (!sttService || typeof sttService.transcribe !== 'function') {
        return null;
      }

      const fileRes = await fetch(`${this.baseUrl}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();
      if (!fileData.ok) return null;

      const filePath = fileData.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
      const audioRes = await fetch(fileUrl);
      const audioBuffer = await audioRes.arrayBuffer();

      const result = await sttService.transcribe(Buffer.from(audioBuffer), 'ogg');
      return result || null;
    } catch (err: any) {
      logger.error('[Telegram] Voice transcribe error:', err);
      return null;
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      });
    } catch (err: any) {
      logger.error('[Telegram] sendMessage error:', err);
    }
  }

  async sendVoice(chatId: string, audioBuffer: Buffer): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
      await fetch(`${this.baseUrl}/sendVoice`, { method: 'POST', body: formData });
    } catch (err: any) {
      logger.error('[Telegram] sendVoice error:', err);
    }
  }
}
