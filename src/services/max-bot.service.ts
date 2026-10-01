import { processMessage } from '../modules/language/language.module';
import { userModeRepository } from '../repositories/user-mode.repository';
import { logger } from '../logger';
import { sqliteDb } from '../../db';
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
        return `🔐 **Selin VPN — Собственный суверенный контур**\n\nУ вас пока нет активного ключа.\nСтоимость годового безлимитного доступа: **500 ₽ / год** (никаких ежемесячных оплат сторонним сервисам!).\n\nДля создания ключа напишите: **Купить**`;
      }

      return `✅ **Ваш ключ Selin VPN активен!**\n\n• **Логин:** \`${client.username}\`\n• **Пароль:** \`${client.password}\`\n• **Сервер:** \`ais-dev-fzpjlzo5denvk4xxawb3rd-163629687200.us-west1.run.app\`\n• **Порт:** \`1080\`\n• **Тариф:** ${client.plan} (до ${client.expires_at || 'бессрочно'})\n\n📲 Используйте эти данные в нашем фирменном приложении **Selin VPN** или любом SOCKS5 клиенте.`;
    } catch (e) {
      return 'Ошибка при проверке статуса VPN.';
    }
  }

  private async handleCreateVpnKey(tenantId: string): Promise<string> {
    try {
      const db = sqliteDb.getDb();
      let client = db.prepare('SELECT * FROM vpn_clients WHERE chat_id = ?').get(tenantId) as any;

      if (client) {
        return `У вас уже есть активный ключ!\n\n• **Логин:** \`${client.username}\`\n• **Пароль:** \`${client.password}\`\n• **Порт:** \`1080\``;
      }

      const id = 'vpn_' + crypto.randomBytes(4).toString('hex');
      const username = 'user_' + crypto.randomBytes(3).toString('hex');
      const password = crypto.randomBytes(6).toString('hex');
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO vpn_clients (id, chat_id, client_name, username, password, plan, status, expires_at)
        VALUES (?, ?, ?, ?, ?, 'annual_500', 'active', ?)
      `).run(id, tenantId, 'Max Bot User ' + tenantId.slice(-4), username, password, expiresAt);

      return `🎉 **Ваш персональный годовой VPN-ключ успешно создан!**\n\nТариф: 500 ₽ / год (активировано).\n\n• **Сервер:** \`ais-dev-fzpjlzo5denvk4xxawb3rd-163629687200.us-west1.run.app\`\n• **Порт:** \`1080\`\n• **Логин:** \`${username}\`\n• **Пароль:** \`${password}\`\n• **Действует до:** ${expiresAt}\n\n💡 Введите эти данные в нашем фирменном приложении **Selin VPN** или в любом SOCKS5-клиенте!`;
    } catch (e) {
      logger.error('Error creating VPN key via Max Bot', e);
      return 'Не удалось создать ключ. Попробуйте позже.';
    }
  }
}

export const maxBotService = new MaxBotService();
