import { Router, Request, Response } from 'express';
import { MarketingCRMService } from '../services/marketing/MarketingCRMService';
import { logger } from '../logger';

const router = Router();

/**
 * Получить список клиентов пользователя в CRM
 */
router.get('/clients', (req: Request, res: Response) => {
  try {
    const chatId = (req.query.chatId as string) || (req as any).user?.chatId || 'default';
    const clients = MarketingCRMService.getClients(chatId);
    return res.json({ success: true, count: clients.length, clients });
  } catch (err: any) {
    logger.error('❌ Error getting CRM clients:', err);
    return res.status(500).json({ error: err?.message || 'Error fetching clients' });
  }
});

/**
 * Добавить / обновить клиента в CRM
 */
router.post('/clients', (req: Request, res: Response) => {
  try {
    const { client_name, channel, day_of_program, notes, status, chatId } = req.body;
    const targetChatId = chatId || (req as any).user?.chatId || 'default';

    if (!client_name) {
      return res.status(400).json({ error: 'client_name is required' });
    }

    MarketingCRMService.saveClient({
      chat_id: String(targetChatId),
      client_name: String(client_name),
      channel: channel || 'telegram',
      day_of_program: Number(day_of_program) || 1,
      status: status || 'active',
      notes: notes || ''
    });

    return res.json({ success: true, message: 'Клиент успешно сохранен' });
  } catch (err: any) {
    logger.error('❌ Error saving CRM client:', err);
    return res.status(500).json({ error: err?.message || 'Error saving client' });
  }
});

/**
 * Анализ диалога и генерация ответа дожима (Sales Co-Pilot)
 */
router.post('/copilot/analyze', async (req: Request, res: Response) => {
  try {
    const { chatLog, goal, chatId } = req.body;
    const targetChatId = chatId || (req as any).user?.chatId || 'default';

    if (!chatLog) {
      return res.status(400).json({ error: 'chatLog is required' });
    }

    const advice = await MarketingCRMService.analyzeChatAndAdvise(targetChatId, chatLog, goal);
    return res.json({ success: true, result: advice });
  } catch (err: any) {
    logger.error('❌ Error in CRM Co-Pilot analyze:', err);
    return res.status(500).json({ error: err?.message || 'Error analyzing chat' });
  }
});

/**
 * Генерация стратегии маркетинга для ниши
 */
router.post('/strategy', async (req: Request, res: Response) => {
  try {
    const { niche, goal, chatId } = req.body;
    const targetChatId = chatId || (req as any).user?.chatId || 'default';

    if (!niche) {
      return res.status(400).json({ error: 'niche is required' });
    }

    const strategy = await MarketingCRMService.generateCampaignPlan(
      targetChatId,
      niche,
      goal || 'Привлечение клиентов и рост выручки'
    );
    return res.json({ success: true, strategy });
  } catch (err: any) {
    logger.error('❌ Error generating strategy:', err);
    return res.status(500).json({ error: err?.message || 'Error generating strategy' });
  }
});

export default router;
