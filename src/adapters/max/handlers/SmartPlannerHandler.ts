// src/adapters/max/handlers/SmartPlannerHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { smartPlannerService } from '../../../services/SmartPlanner';
import { CascadeEngine } from '../../../engines/CascadeEngine';

export class SmartPlannerHandler implements IMessageHandler {
  public readonly name = 'SmartPlannerHandler';
  public readonly priority = 85;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('цель:') ||
      text.startsWith('цель ') ||
      text.startsWith('задача:') ||
      text.startsWith('задача ') ||
      text === 'мои цели' ||
      text === 'мои задачи' ||
      text.startsWith('сделано ') ||
      text === 'смарт брифинг' ||
      text === 'брифинг'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.text.trim();
      const lower = ctx.lowerText;

      // 1. Goal creation
      if (lower.startsWith('цель:') || lower.startsWith('цель ')) {
        const goalTitle = text.replace(/^цель:?\s*/i, '').trim();
        if (!goalTitle) {
          return { handled: true, replyText: '🎯 Пожалуйста, укажите формулировку вашей цели.' };
        }

        const goal = await smartPlannerService.createGoal(ctx.chatId, goalTitle);
        if (goal) {
          await smartPlannerService.decomposeGoal(goal.id, ctx.chatId);
        }

        const reply =
          `🎯 **Цель зафиксирована и декомпозирована!**\n\n` +
          `📌 **Цель**: ${goal?.title || goalTitle}\n` +
          `💡 Сгенерированы задачи на сегодня. Напишите «мои задачи», чтобы посмотреть их.`;

        return { handled: true, replyText: reply, voiceText: 'Цель принята и декомпозирована на задачи.' };
      }

      // 2. Task creation
      if (lower.startsWith('задача:') || lower.startsWith('задача ')) {
        const taskTitle = text.replace(/^задача:?\s*/i, '').trim();
        if (!taskTitle) {
          return { handled: true, replyText: '📝 Укажите название задачи.' };
        }

        const task = smartPlannerService.addTask(ctx.chatId, taskTitle);
        return {
          handled: true,
          replyText: `✅ Задача добавлена: **[#${task?.id || 1}] ${task?.title || taskTitle}**`
        };
      }

      // 3. List goals
      if (lower === 'мои цели') {
        const goals = smartPlannerService.getGoals(ctx.chatId);
        if (goals.length === 0) {
          return { handled: true, replyText: '🎯 У вас пока нет активных SMART-целей. Напишите: «цель: Ваша цель».' };
        }

        let reply = '🎯 **Ваши SMART-цели**:\n\n';
        goals.forEach((g, idx) => {
          reply += `${idx + 1}. **${g.title}** (${g.status})\n   Дата: ${g.target_date || '-'}\n\n`;
        });
        return { handled: true, replyText: reply.trim() };
      }

      // 4. List tasks
      if (lower === 'мои задачи') {
        const tasks = smartPlannerService.getTasks(ctx.chatId);
        if (tasks.length === 0) {
          return { handled: true, replyText: '📝 У вас пока нет задач. Добавьте командой «задача: Текст».' };
        }

        let reply = '📝 **Ваши текущие задачи**:\n\n';
        tasks.forEach((t) => {
          const statusIcon = t.is_completed ? '✅' : '⏳';
          reply += `${statusIcon} [#${t.id}] ${t.title}\n`;
        });
        reply += '\n_Отметить выполненной: «сделано [ID]»_';
        return { handled: true, replyText: reply.trim() };
      }

      // 5. Complete task
      if (lower.startsWith('сделано ')) {
        const idStr = lower.replace('сделано ', '').trim();
        const taskId = parseInt(idStr, 10);
        if (isNaN(taskId)) {
          return { handled: true, replyText: '⚠️ Укажите числовой номер задачи. Например: «сделано 1».' };
        }

        const success = smartPlannerService.toggleTask(taskId, ctx.chatId);
        if (success) {
          return {
            handled: true,
            replyText: `🎉 Статус задачи [#${taskId}] успешно изменён!`
          };
        }
        return { handled: true, replyText: `⚠️ Задача #${taskId} не найдена.` };
      }

      // 6. Morning briefing
      if (lower === 'смарт брифинг' || lower === 'брифинг') {
        const briefing = await smartPlannerService.generateDailyBriefing(ctx.chatId);
        return {
          handled: true,
          replyText: briefing.formattedText,
          voiceText: briefing.aiMotivation
        };
      }

      return { handled: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[SmartPlannerHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
