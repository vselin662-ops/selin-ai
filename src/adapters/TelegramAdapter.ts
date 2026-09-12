import { logger } from '../logger';
import { synthesizeForChat, speakable } from '../services/voice/TTSService';
import { sttService } from '../services/voice/stt.service';
import { AgentOrchestrator } from '../core/AgentOrchestrator';
import { MessageContext, ChannelType } from '../core/types';
import { stripMarkdown } from '../core/LLMService';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';

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
            await this.sendMessage(chatId, 'Не разобрал голос, напиши текстом.');
            return res.status(200).json({ ok: true });
          }
          userText = transcribed;
        } else {
          await this.sendMessage(chatId, 'Не разобрал голос, напиши текстом.');
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

      if (isVoice) {
        try {
          const cleanedText = speakable ? speakable(aiResponse.text) : stripMarkdown(aiResponse.text).replace(/\([^)]*\)/g, '');
          const audioBuffer = await synthesizeForChat(chatId, cleanedText);
          if (audioBuffer && audioBuffer.length > 0) {
            try {
              const oggBuffer = await this.convertMp3ToOggOpus(audioBuffer);
              await this.sendVoice(chatId, oggBuffer);
            } catch (convErr: any) {
              logger.warn('[Telegram] OGG conversion failed, falling back to MP3:', convErr?.message || convErr);
              await this.sendAudio(chatId, audioBuffer);
            }
          }
        } catch (ttsErr: any) {
          logger.warn('[Telegram] Voice synthesis failed:', ttsErr?.message || ttsErr);
        }
      } else {
        await this.sendMessage(chatId, aiResponse.text);
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

  private async convertMp3ToOggOpus(mp3Buffer: Buffer): Promise<Buffer> {
    const ffCmd = ffmpegPath || 'ffmpeg';
    const tempDir = os.tmpdir();
    const tempInput = path.join(tempDir, `input_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
    const tempOutput = path.join(tempDir, `output_${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`);

    try {
      await fs.promises.writeFile(tempInput, mp3Buffer);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffCmd, [
          '-i', tempInput,
          '-c:a', 'libopus',
          '-b:a', '32k',
          '-ar', '48000',
          '-ac', '1',
          tempOutput
        ]);

        let errStr = '';
        proc.stderr.on('data', (chunk) => {
          errStr += chunk.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`ffmpeg exited with code ${code}: ${errStr}`));
          }
        });

        proc.on('error', (err) => {
          reject(err);
        });
      });

      const oggBuffer = await fs.promises.readFile(tempOutput);
      return oggBuffer;
    } finally {
      await fs.promises.unlink(tempInput).catch(() => {});
      await fs.promises.unlink(tempOutput).catch(() => {});
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

  async sendAudio(chatId: string, audioBuffer: Buffer): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voice.mp3');
      const res = await fetch(`${this.baseUrl}/sendAudio`, {
        method: 'POST',
        body: formData
      });
      const data: any = await res.json();
      if (!data.ok) {
        logger.error('[Telegram] sendAudio failed:', JSON.stringify(data));
      }
    } catch (err: any) {
      logger.error('[Telegram] sendAudio error:', err?.message || err);
    }
  }
}
