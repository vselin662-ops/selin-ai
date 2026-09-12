import { logger } from '../logger';
import { synthesizeForChat } from '../services/TTSService';
import { sttService } from '../services/stt.service';
import { AgentOrchestrator } from '../core/AgentOrchestrator';
import { MessageContext, ChannelType } from '../core/types';
import { stripMarkdown } from '../core/LLMService';

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

      if (message.text) {
        userText = message.text;
      } else if (message.voice || message.video_note) {
        isVoice = true;
        const fileId = message.voice?.file_id || message.video_note?.file_id;
        if (fileId) {
          const transcribed = await this.downloadAndTranscribe(fileId);
          if (!transcribed) {
            await this.sendMessage(chatId, 'Не могу разобрать голос, напиши текстом.');
            return res.status(200).json({ ok: true });
          }
          userText = transcribed;
        } else {
          await this.sendMessage(chatId, 'Не могу разобрать голос, напиши текстом.');
          return res.status(200).json({ ok: true });
        }
      } else if (message.photo) {
        userText = '[фото]';
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
        } catch (ttsErr: any) {
          logger.warn('[Telegram] Voice synthesis failed:', ttsErr?.message || ttsErr);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      logger.error('[Telegram] Webhook error:', err?.message || err);
      return res.status(200).json({ ok: true });
    }
  }

  private async downloadAndTranscribe(fileId: string): Promise<string | null> {
    try {
      const fileRes = await fetch(`${this.baseUrl}/getFile?file_id=${fileId}`);
      const fileData: any = await fileRes.json();
      if (!fileData.ok || !fileData.result?.file_path) {
        logger.error('[Telegram] getFile failed:', fileData);
        return null;
      }

      const filePath = fileData.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
      const audioRes = await fetch(fileUrl);
      if (!audioRes.ok) {
        logger.error(`[Telegram] Failed to download audio file: ${audioRes.status}`);
        return null;
      }

      const arrayBuffer = await audioRes.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      const transcribed = await sttService.transcribe(audioBuffer);
      return transcribed && transcribed.trim() ? transcribed.trim() : null;
    } catch (err: any) {
      logger.error('[Telegram] Voice transcribe error:', err?.message || err);
      return null;
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      let cleaned = stripMarkdown(text);
      cleaned = cleaned
        .replace(/^[\-\*\•]\s+/gm, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();

      await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: cleaned.slice(0, 4000) })
      });
    } catch (err: any) {
      logger.error('[Telegram] sendMessage error:', err?.message || err);
    }
  }

  async sendVoice(chatId: string, audioBuffer: Buffer): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
      const res = await fetch(`${this.baseUrl}/sendVoice`, {
        method: 'POST',
        body: formData
      });
      const data: any = await res.json();
      if (!data.ok) {
        logger.error('[Telegram] sendVoice failed:', JSON.stringify(data));
      }
    } catch (err: any) {
      logger.error('[Telegram] sendVoice error:', err?.message || err);
    }
  }
}
