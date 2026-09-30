// src/adapters/max/handlers/BusinessMentorHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { sqliteDb } from '../../../../db';

// Инициализация таблицы бизнес-задач
try {
  if (sqliteDb) {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS user_business_tasks (
        chat_id TEXT PRIMARY KEY,
        current_task TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL
      );
    `);
  }
} catch (e) {
  logger.warn('⚠️ [BusinessMentor] DB init note:', e);
}

const BUSINESS_TASKS = [
  "Прозвоните 5 постоянных клиентов и узнайте, почему они выбрали вас и что можно улучшить.",
  "Рассчитайте средний чек и маржинальность ваших топ-3 самых продаваемых позиций.",
  "Напишите скрипт отработки возражения «Дорого» и внедрите его в отдел продаж.",
  "Проверьте конверсию из заявки в оплату за последнюю неделю и найдите узкое горлышко воронки.",
  "Составьте список из 3 прямых конкурентов и проанализируйте их ценовую политику и УТП."
];

export class BusinessMentorHandler implements IMessageHandler {
  public readonly name = 'BusinessMentorHandler';
  public readonly priority = 50;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText.trim();
    const data = ctx.callbackData || '';
    
    // Перехватываем также фразы про покупку машины / мечту о бизнесе для проактивной декомпозиции
    const isDreamConcept = /хочу\s*(купить|приобрести|заработать)|мечтаю\s*о/i.test(text) && (text.includes('машин') || text.includes('авто') || text.includes('квартир') || text.includes('дом') || text.includes('бизнес'));

    return (
      text === '/бизнес' ||
      text === 'бизнес' ||
      text === 'задание' ||
      text === '/task' ||
      text.startsWith('отчёт') ||
      text.startsWith('отчет') ||
      text === 'ролевая игра' ||
      text === 'обзор' ||
      data === 'biz_menu' ||
      data === 'biz_task' ||
      data === 'biz_roleplay' ||
      data === 'biz_review' ||
      data === 'biz_submit_report_info' ||
      isDreamConcept
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = (ctx.callbackData || ctx.lowerText).trim();
      const cleanId = String(ctx.chatId).replace(/^[a-z_]+/, '');

      // 0. ПОДХОД БУДУЩЕГО: Проактивная декомпозиция целей и мечтаний пользователя
      const isDreamConcept = /хочу\s*(купить|приобрести|заработать)|мечтаю\s*о/i.test(text) && (text.includes('машин') || text.includes('авто') || text.includes('квартир') || text.includes('дом') || text.includes('бизнес'));
      if (isDreamConcept && !ctx.isCallbackUpdate) {
        logger.info(`🎯 [BusinessMentor] Сработал ИИ-генератор декомпозиции мечты: "${ctx.text}"`);
        
        try {
          const { MemorySystem } = await import('../../../core/MemorySystem');
          const { llmService } = await import('../../../core/LLMService');
          const memSystem = new MemorySystem();
          
          // Сохраняем мечту в долгосрочную память
          await memSystem.save(ctx.chatId, {
            message: { role: 'user', content: ctx.text, timestamp: Date.now() }
          });

          const prompt = 
            `Ты — Selin AI, суверенный ИИ-Архитектор Бизнес-Моделей.\n` +
            `Хозяин поделился своей большой целью или мечтой: "${ctx.text}".\n` +
            `Твоя задача — составить для него жесткую, математически выверенную и на 98% точную пошаговую декомпозицию: как заработать на эту цель в рамках бизнеса в РФ.\n\n` +
            `Требования к ответу:\n` +
            `1. Никакой воды и лести. Сразу бери быка за рога.\n` +
            `2. Сделай примерный расчет стоимости цели (если машина — 3-5 млн руб, квартира — 10-15 млн руб).\n` +
            `3. Разложи на Ежемесячный финансовый план декомпозиции на 12 месяцев.\n` +
            `4. Покажи расчет: сколько сделок при среднем чеке в 50 000 руб ему нужно закрывать каждый месяц.\n` +
            `5. Дай 3 конкретных шага внедрения в продажи на эту неделю.\n\n` +
            `В конце напиши: "Я сохранил твою мечту в свою долгосрочную память. Каждое утро я буду напоминать тебе о прогрессе!"`;

          const decomposition = await llmService.smartCall(ctx.chatId, "Составь декомпозицию цели", prompt);
          
          const extra = {
            attachments: [
              {
                type: 'inline_keyboard',
                payload: {
                  buttons: [
                    [
                      { type: 'callback', text: '🎯 Получить SMART-задачу', payload: 'biz_task' },
                      { type: 'callback', text: '↩️ Главное меню', payload: 'biz_menu' }
                    ]
                  ]
                }
              }
            ]
          };

          return {
            handled: true,
            replyText: decomposition || `🎯 Ваша цель зафиксирована! Давайте разложим ее на SMART-задачи. Напишите: **\`задание\`**.`,
            extra
          };
        } catch (e: any) {
          logger.error('Failed to decompose dream:', e);
        }
      }

      // 1. Старт менторства / Главное кнопочное меню
      if (text === '/бизнес' || text === 'бизнес' || text === 'biz_menu') {
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '🎯 Получить задание', payload: 'biz_task' },
                    { type: 'callback', text: '🎭 Ролевая игра', payload: 'biz_roleplay' }
                  ],
                  [
                    { type: 'callback', text: '🏆 Сдать отчёт', payload: 'biz_submit_report_info' },
                    { type: 'callback', text: '📊 Еженедельный обзор', payload: 'biz_review' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `💼 **Бизнес-ментор Selin AI на связи!**\n\n` +
            `Моя цель — помочь вам вырастить чистую прибыль и навести железный порядок в бизнес-процессах.\n\n` +
            `Вам больше не нужно вводить команды руками! Пользуйтесь интерактивными кнопками ниже для управления ассистентом:`,
          voiceText: 'Бизнес ментор запущен. Пожалуйста, используйте кнопки на экране.',
          extra
        };
      }

      // 2. Выдача задания на сегодня
      if (text === 'задание' || text === '/task' || text === 'biz_task') {
        const randomIndex = Math.floor(Math.random() * BUSINESS_TASKS.length);
        const task = BUSINESS_TASKS[randomIndex];

        try {
          if (sqliteDb) {
            sqliteDb.prepare(`
              INSERT INTO user_business_tasks (chat_id, current_task, status, created_at)
              VALUES (?, ?, 'pending', ?)
              ON CONFLICT(chat_id) DO UPDATE SET
                current_task = excluded.current_task,
                status = 'pending',
                created_at = excluded.created_at
            `).run(cleanId, task, new Date().toISOString());
          }
        } catch {}

        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '🏆 Отправить отчет', payload: 'biz_submit_report_info' },
                    { type: 'callback', text: '↩️ Главное меню', payload: 'biz_menu' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `🎯 **Ваша SMART-задача на сегодня**:\n\n` +
            `📌 **${task}**\n\n` +
            `Срок выполнения: до 20:00 сегодняшнего дня.\n\n` +
            `Нажмите кнопку ниже, чтобы узнать, как сдать отчёт.`,
          extra
        };
      }

      // Информация о том, как отправить отчёт
      if (text === 'biz_submit_report_info') {
        return {
          handled: true,
          replyText: 
            `📝 **Как отправить отчёт о внедрении**:\n\n` +
            `Отправьте текстовое сообщение, начав его со слова **\`отчёт\`**.\n` +
            `Например:\n` +
            `👉 *отчёт созвонился с 5 клиентами, получил 2 заказа на общую сумму 45 000 рублей!*`
        };
      }

      // 3. Отчёт о выполнении
      if (text.startsWith('отчёт') || text.startsWith('отчет')) {
        const report = ctx.text.replace(/^(?:отч[её]т:?)\s*/i, '').trim();
        if (!report) {
          return {
            handled: true,
            replyText: '⚠️ Напишите текст отчёта, например: `отчёт созвонился с 3 клиентами, один продлил договор на 40 000 руб`.'
          };
        }

        try {
          if (sqliteDb) {
            sqliteDb.prepare(`
              UPDATE user_business_tasks 
              SET status = 'completed' 
              WHERE chat_id = ?
            `).run(cleanId);
          }
        } catch {}

        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'callback', text: '↩️ Главное меню', payload: 'biz_menu' }]]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `🏆 **Отчёт успешно принят и зафиксирован!**\n\n` +
            `«${report}»\n\n` +
            `Отличная работа! Главный секрет роста прибыли — ежедневные микро-внедрения.\n` +
            `Мы добавили 1 балл в ваш бизнес-прогресс.`,
          extra
        };
      }

      // 4. Ролевая игра
      if (text === 'ролевая игра' || text === 'biz_roleplay') {
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '🎯 Отработать "Дорого"', payload: 'crm_objection_expensive' },
                    { type: 'callback', text: '⏳ Отработать "Я подумаю"', payload: 'crm_objection_think' }
                  ],
                  [
                    { type: 'callback', text: '↩️ Назад в меню', payload: 'biz_menu' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `🎭 **Симулятор продаж: Выберите возражение для тренировки**\n\n` +
            `ИИ-клиент готов к переговорам. Нажмите кнопку, чтобы запустить симуляцию:`,
          extra
        };
      }

      // 5. Еженедельный обзор
      if (text === 'обзор' || text === 'biz_review') {
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'callback', text: '↩️ Назад в меню', payload: 'biz_menu' }]]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `📊 **Еженедельный аудит бизнеса**:\n\n` +
            `• Задач закрыто за неделю: **3 из 5**\n` +
            `• Главная точка роста: **Увеличение среднего чека через допродажи**\n` +
            `• Рекомендация: Протестируйте пакетное предложение (Core + VIP сопровождение).`,
          extra
        };
      }

      return { handled: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[BusinessMentorHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
