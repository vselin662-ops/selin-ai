import { sqliteDb } from "../../db";
import { logger } from "../logger";
import { getLocalTimeAndDate, isPlanSlotAlreadySent, markPlanSlotSent } from "./bibleService";
import { buildSlotContent } from "./PlanContentBuilder";

export class PlanScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  public start() {
    if (this.intervalId) {
      logger.warn("⚠️ [PlanScheduler] Scheduler is already running");
      return;
    }

    logger.info("🕊 [PlanScheduler] Запущен");
    this.intervalId = setInterval(() => this.checkAndSendBroadcasts(), 60000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("🕊 [PlanScheduler] Остановлен");
    }
  }

  public async checkAndSendBroadcasts() {
    if (!sqliteDb) {
      logger.warn("⚠️ [PlanScheduler] Database not connected, skipping schedule check");
      return;
    }

    try {
      // 1. Выбирай пользователей с plan_enabled = 1
      const users = sqliteDb.prepare(`
        SELECT chat_id, plan_enabled, plan_status, tz, slot_times, voice_on, plan_day_offset 
        FROM user_profiles 
        WHERE plan_enabled = 1 AND plan_status != 'off'
      `).all() as any[];

      if (!users || users.length === 0) return;

      for (const u of users) {
        const chatId = String(u.chat_id);
        const tz = u.tz || 'Europe/Moscow';
        
        // 2. Вычисляй локальное время по timezone пользователя
        const { timeStr, dateStr } = getLocalTimeAndDate(tz);

        try {
          let slotTimes = { m: '07:30', n: '13:00', e: '21:00' };
          if (u.slot_times) {
            try {
              slotTimes = { ...slotTimes, ...JSON.parse(u.slot_times) };
            } catch {}
          }

          let slotKey: 'morning' | 'noon' | 'evening' | null = null;
          let shortSlot: 'm' | 'n' | 'e' = 'm';

          if (timeStr === slotTimes.m) {
            slotKey = 'morning';
            shortSlot = 'm';
          } else if (timeStr === slotTimes.n) {
            slotKey = 'noon';
            shortSlot = 'n';
          } else if (timeStr === slotTimes.e) {
            slotKey = 'evening';
            shortSlot = 'e';
          }

          // 3. Если время не совпало со слотом
          if (!slotKey) {
            const logMsg = `[PlanScheduler] юзер=${chatId} локально=${timeStr} отправка=нет/не время слота`;
            logger.info(logMsg);
            console.log(logMsg);
            continue;
          }

          // 4. Проверка: уже отправлялось сегодня
          if (isPlanSlotAlreadySent(chatId, shortSlot, dateStr)) {
            const logMsg = `[PlanScheduler] юзер=${chatId} локально=${timeStr} отправка=нет/уже отправлено`;
            logger.info(logMsg);
            console.log(logMsg);
            continue;
          }

          // 5. Сборка и отправка контента
          const content = await buildSlotContent(chatId, slotKey);
          const { modernMaxAdapter } = await import("../../server");

          if (u.voice_on === 1) {
            await modernMaxAdapter.sendToUser(chatId, content.text);
            await modernMaxAdapter.sendVoice(chatId, content.voiceText);
          } else {
            await modernMaxAdapter.sendToUser(chatId, content.text);
          }

          // 6. Фиксация в логах отправки
          markPlanSlotSent(chatId, shortSlot, dateStr);

          const logMsg = `[PlanScheduler] юзер=${chatId} локально=${timeStr} отправка=да/${shortSlot}`;
          logger.info(logMsg);
          console.log(logMsg);
        } catch (userErr: any) {
          const logMsg = `[PlanScheduler] юзер=${chatId} локально=${timeStr} отправка=нет/ошибка: ${userErr?.message || userErr}`;
          logger.error(logMsg);
          console.log(logMsg);
        }
      }
    } catch (err: any) {
      logger.error("❌ [PlanScheduler] Error in schedule check loop:", err.message || err);
    }
  }
}

export const planScheduler = new PlanScheduler();
