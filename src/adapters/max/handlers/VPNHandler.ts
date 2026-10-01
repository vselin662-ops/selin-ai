import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { sqliteDb } from '../../../../db';

export class VPNHandler implements IMessageHandler {
  public readonly name = 'VPNHandler';
  public readonly priority = 20;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text === '/vpn' || text === 'vpn' || text === 'впн';
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const chatId = String(ctx.chatId);
      
      // Ищем существующий ключ для этого пользователя
      let client = sqliteDb?.prepare("SELECT * FROM vpn_clients WHERE chat_id = ?").get(chatId);

      if (!client) {
        // Если ключа нет, создаем "Пробный" доступ (Trial)
        const id = `vpn_${Date.now()}`;
        const username = `u${Math.random().toString(36).substring(2, 7)}`;
        const password = Math.random().toString(36).substring(2, 10);
        const now = new Date().toISOString();

        sqliteDb?.prepare(`
          INSERT INTO vpn_clients (id, chat_id, client_name, username, password, plan, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, chatId, 'Trial User', username, password, 'trial', 'active', now);
        
        client = { username, password, client_name: 'Trial User' };
      }

      // Генерируем ссылку (Хост берем из окружения или контекста, здесь захардкодим для примера)
      const host = 'ais-pre-fzpjlzo5denvk4xxawb3rd-163629687200.us-west1.run.app';
      const port = 1080;
      const configLink = `socks5://${client.username}:${client.password}@${host}:${port}#SelinVPN_${chatId.slice(-4)}`;

      const replyText = 
        `🛡️ **Ваш персональный доступ Selin VPN**\n\n` +
        `Мы подготовили для вас сверхзащищенный туннель для безопасного выхода в сеть.\n\n` +
        `🚀 **Ваша ссылка (нажмите, чтобы скопировать):**\n` +
        `\`${configLink}\`\n\n` +
        `📖 **Как настроить?**\n` +
        `1. Скачайте бесплатное приложение: **Shadowrocket** (iOS) или **v2rayNG** / **Hiddify** (Android/PC).\n` +
        `2. Скопируйте ссылку выше.\n` +
        `3. Откройте приложение и нажмите **«Импортировать из буфера обмена»**.\n` +
        `4. Нажмите «Подключиться».\n\n` +
        `💎 Хотите безлимитный VIP-доступ без ограничений по скорости? Обратитесь к администратору @vselin662`;

      return {
        handled: true,
        replyText,
        voiceText: 'Ваш доступ к вэ пэ эн готов. Ссылка отправлена в текстовом сообщении.'
      };

    } catch (err: any) {
      logger.error(`[VPNHandler] Error: ${err.message}`);
      return { handled: false };
    }
  }
}
