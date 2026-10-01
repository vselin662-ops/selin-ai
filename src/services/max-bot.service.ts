import { processMessage } from '../modules/language/language.module';
import { userModeRepository } from '../repositories/user-mode.repository';
import { logger } from '../logger';
import { sqliteDb } from '../../db';
import { ProtocolGenerator } from './network/ProtocolGenerator';
import crypto from 'crypto';

/**
 * Сервис обработки входящих сообщений от Max Bot.
 */
class MaxBotService {
  /**
   * Обрабатывает сообщение пользователя от Max Bot.
   *
   * @param tenantId - Идентификатор пользователя
   * @param text - Текст сообщения
   * @param isVoice - Флаг голосового сообщения
   * @returns Ответ для отправки пользователю
   */
  async handleIncomingMessage(tenantId: string, text: string, isVoice: boolean = false): Promise<string> {
    try {
      const lowerText = text.trim().toLowerCase();

      if (lowerText === '/vpn' || lowerText === 'vpn' || lowerText === 'купить впн' || lowerText === 'впн') {
        return this.handleVpnCommand(tenantId);
      }

      if (lowerText.startsWith('/buy_vpn') || lowerText.startsWith('купить') || lowerText.startsWith('500')) {
        return this.handleCreateVpnKey(tenantId);
      }

      const modeRecord = await userModeRepository.getMode(tenantId);
      if (modeRecord?.mode === 'language') {
        return await processMessage(tenantId, text, isVoice);
      }
      
      return `🛡️ **Selin VPN (SST) узел готов к работе!**\n\nВы можете приобрести годовой безлимитный доступ всего за 500 рублей.\n\nКоманды бота:\n• **VPN** — статус и получение вашего ключа\n• **Купить** — оформить годовую подписку (500 ₽/год)`;
    } catch (err) {
      logger.error('Error handling Max Bot message', { error: err, tenantId });
      return 'Произошла ошибка при обработке сообщения.';
    }
  }

  private async handleVpnCommand(tenantId: string): Promise<string> {
    try {
      const db = sqliteDb.getDb();
      const client = db.prepare('SELECT * FROM vpn_clients WHERE chat_id = ?').get(tenantId) as any;

      if (!client) {
        return `🔐 **Selin VPN — Собственный суверенный контур**\n\nУ вас пока нет активного ключа.\nСтоимость годового безлимитного доступа: **500 ₽ / год**.\n\nДля создания ключа напишите: **Купить**`;
      }

      const clientUuid = client.uuid || 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
      const serverIp = process.env.VPN_SERVER_IP || '176.108.252.111';
      const vlessLink = ProtocolGenerator.generateVLESS({
        uuid: clientUuid,
        serverIp,
        port: 3000,
        clientName: client.client_name || 'User'
      });

      return `✅ **Ваш ключ Selin VPN активен!**\n\n🚀 **Ключ для Happ / v2rayNG / Shadowrocket (в 1 клик):**\n\`${vlessLink}\`\n\n• **Сервер:** \`${serverIp}\`\n• **Тариф:** ${client.plan} (до ${client.expires_at || 'бессрочно'})\n\n💡 Просто скопируйте ссылку выше и вставьте в **Happ** (он сам импортирует сервер за 1 секунду)!`;
    } catch (e) {
      return 'Ошибка при проверке статуса VPN.';
    }
  }

  private async handleCreateVpnKey(tenantId: string): Promise<string> {
    try {
      const db = sqliteDb.getDb();
      let client = db.prepare('SELECT * FROM vpn_clients WHERE chat_id = ?').get(tenantId) as any;

      if (client) {
        return this.handleVpnCommand(tenantId);
      }

      const id = 'vpn_' + crypto.randomBytes(4).toString('hex');
      const username = 'user_' + crypto.randomBytes(3).toString('hex');
      const password = crypto.randomBytes(6).toString('hex');
      const clientUuid = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const serverIp = process.env.VPN_SERVER_IP || '176.108.252.111';

      db.prepare(`
        INSERT INTO vpn_clients (id, chat_id, client_name, username, password, uuid, plan, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'annual_500', 'active', ?)
      `).run(id, tenantId, 'Max User ' + tenantId.slice(-4), username, password, clientUuid, expiresAt);

      const vlessLink = ProtocolGenerator.generateVLESS({
        uuid: clientUuid,
        serverIp,
        port: 3000,
        clientName: 'Max User ' + tenantId.slice(-4)
      });

      return `🎉 **Ваш персональный годовой VPN-ключ успешно создан!**\n\nТариф: 500 ₽ / год (активировано).\n\n🚀 **Ссылка для импорта в Happ (в 1 клик):**\n\`${vlessLink}\`\n\n• **Сервер:** \`${serverIp}\`\n• **UUID:** \`${clientUuid}\`\n• **Действует до:** ${expiresAt}\n\n💡 Скопируйте ссылку, откройте **Happ** и нажмите «Импортировать»!`;
    } catch (e) {
      logger.error('Error creating VPN key via Max Bot', e);
      return 'Не удалось создать ключ. Попробуйте позже.';
    }
  }
}

export const maxBotService = new MaxBotService();
