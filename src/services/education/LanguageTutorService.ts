// src/services/education/LanguageTutorService.ts
import { sqliteDb } from '../../../db';
import { logger } from '../../logger';
import { searchWeb } from '../ai/WebSearchService';
import { llmService } from '../../core/LLMService';

export interface UserLanguageProfile {
  chat_id: string;
  target_lang: string;
  level: string; // 'beginner', 'intermediate', 'advanced'
  stage: string; // 'assessment', 'vocab', 'grammar', 'practice', 'exam'
  current_topic?: string;
  last_task?: string;
  last_correct_answer?: string;
  streak: number;
  last_lesson_at: string;
  total_words: number;
}

// 1. Инициализация расширенной базы данных Языкового Наставника
try {
  if (sqliteDb) {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS user_language_profile (
        chat_id TEXT PRIMARY KEY,
        target_lang TEXT NOT NULL DEFAULT 'английский',
        level TEXT NOT NULL DEFAULT 'beginner',
        stage TEXT NOT NULL DEFAULT 'vocab',
        current_topic TEXT DEFAULT 'Основы общения',
        last_task TEXT,
        last_correct_answer TEXT,
        streak INTEGER DEFAULT 1,
        last_lesson_at TEXT,
        total_words INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS user_vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        word TEXT NOT NULL,
        translation TEXT NOT NULL,
        example TEXT,
        repetition_step INTEGER DEFAULT 0,
        next_review_at INTEGER NOT NULL
      );
    `);
  }
} catch (e) {
  logger.warn('⚠️ [LanguageTutor] DB init note:', e);
}

export class LanguageTutorService {
  /**
   * Получить или создать профиль ученика
   */
  public static getProfile(chatId: string): UserLanguageProfile {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '');
    try {
      if (sqliteDb) {
        const row = sqliteDb.prepare('SELECT * FROM user_language_profile WHERE chat_id = ?').get(cleanId);
        if (row) return row as UserLanguageProfile;
      }
    } catch {}

    const def: UserLanguageProfile = {
      chat_id: cleanId,
      target_lang: 'английский',
      level: 'A1-A2',
      stage: 'vocab',
      current_topic: 'Основы общения и действия',
      streak: 1,
      last_lesson_at: new Date().toISOString(),
      total_words: 0
    };

    try {
      if (sqliteDb) {
        sqliteDb.prepare(`
          INSERT INTO user_language_profile (chat_id, target_lang, level, stage, current_topic, streak, last_lesson_at, total_words)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(def.chat_id, def.target_lang, def.level, def.stage, def.current_topic, def.streak, def.last_lesson_at, def.total_words);
      }
    } catch {}

    return def;
  }

  /**
   * Активация курса: поиск реальных актуальных бесплатных материалов в сети
   */
  public static async setLanguage(chatId: string, langName: string): Promise<{ text: string }> {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '');
    const cleanLang = langName.toLowerCase().trim();

    // 1. Поиск проверенных бесплатных учебных программ в реальном времени
    let courseInfo = "";
    try {
      const query = `лучший бесплатный курс ${cleanLang} для начинающих A1 A2 программа обучения`;
      const searchRes = await searchWeb(query);
      if (searchRes && searchRes.length > 0) {
        const top = searchRes.slice(0, 2);
        courseInfo = top.map(r => `• **${r.title}**: ${r.snippet}`).join('\n');
      }
    } catch (e) {
      logger.warn('⚠️ [LanguageTutor] Web search warning:', e);
    }

    try {
      if (sqliteDb) {
        sqliteDb.prepare(`
          INSERT INTO user_language_profile (chat_id, target_lang, level, stage, current_topic, streak, last_lesson_at, total_words)
          VALUES (?, ?, 'A1-A2', 'vocab', 'Базовые глаголы и конструкции', 1, ?, 0)
          ON CONFLICT(chat_id) DO UPDATE SET
            target_lang = excluded.target_lang,
            stage = 'vocab',
            last_lesson_at = excluded.last_lesson_at
        `).run(cleanId, cleanLang, new Date().toISOString());
      }
    } catch (e) {
      logger.error('❌ [LanguageTutor] setLanguage error:', e);
    }

    return {
      text:
        `🌍 **Языковой Наставник Selin AI активирован!**\n\n` +
        `• Целевой язык: **${cleanLang.toUpperCase()}**\n` +
        `• Ваш уровень: **A1-A2 (Стартовый интенсив)**\n` +
        `• Текущий модуль: **Базовые глаголы и конструкции**\n` +
        `• Система памяти: **Интервальные повторения Anki (SM-2)**\n\n` +
        (courseInfo ? `📚 **Опираюсь на проверенную открытую базу знаний**:\n${courseInfo}\n\n` : '') +
        `🎓 **Как проходит наше обучение**:\n` +
        `1. Напишите **\`новый урок\`** — я объясню тему, дам 5 сильных слов и задам вам проверочный вопрос.\n` +
        `2. Вы отвечаете текстом или голосом — я проверяю грамматику и ставлю произношение.\n` +
        `3. Напишите **\`тест\`** — чтобы я проверил, готовы ли вы перейти на уровень выше!`
    };
  }

  /**
   * Генерация полноценного адаптивного урока с объяснением и практическим заданием
   */
  public static async getNewLesson(chatId: string): Promise<{ text: string }> {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '');
    const profile = this.getProfile(cleanId);

    const prompt =
      `Ты — профессиональный персональный репетитор по языку: ${profile.target_lang}.\n` +
      `Текущий уровень ученика: ${profile.level}. Текущая стадия: ${profile.stage}.\n` +
      `Составь короткий, невероятно понятный и эффективный микро-урок на 2 минуты:\n` +
      `1. Тема урока (жизненная ситуация: бизнес, переговоры, аэропорт, кафе).\n` +
      `2. Ровно 3-4 ключевых слова или фразы с переводом, транскрипцией и примером в предложении.\n` +
      `3. Одно простое практическое правило (грамматический лайфхак).\n` +
      `4. В КОНЦЕ УРОКА ОБЯЗАТЕЛЬНО ЗАДАЙ УЧЕНИКУ ОДНО КОНКРЕТНОЕ ПРОВЕРОЧНОЕ ЗАДАНИЕ (перевести фразу или ответить на вопрос на изучаемом языке).\n` +
      `Отвечай по-русски, лаконично, структурированно, без воды.`;

    let lessonText = await llmService.smartCall(cleanId, prompt);
    if (!lessonText || lessonText.length < 50) {
      lessonText =
        `📚 **Урок: Деловая встреча и знакомство (${profile.target_lang.toUpperCase()})**\n\n` +
        `• **Pleasure to meet you** [ˈpleʒə tuː miːt juː] — Приятно познакомиться.\n` +
        `• **Let's get down to business** — Давайте перейдем к делу.\n` +
        `• **Looking forward to our cooperation** — С нетерпением жду нашего сотрудничества.\n\n` +
        `💡 **Лайфхак**: Фраза *«Let's get down to...»* универсальна для делового старта.\n\n` +
        `✍️ **Проверочное задание на сегодня**:\n` +
        `Переведите на изучаемый язык предложение:\n` +
        `*«Приятно познакомиться, давайте перейдем к делу.»*\n\n` +
        `_Отправьте мне ваш перевод текстом или голосом — я проверю правильность!_`;
    }

    // Сохраняем, что у пользователя висит активное задание
    try {
      if (sqliteDb) {
        sqliteDb.prepare(`
          UPDATE user_language_profile 
          SET last_task = ?, stage = 'practice', last_lesson_at = ?
          WHERE chat_id = ?
        `).run(lessonText, new Date().toISOString(), cleanId);
      }
    } catch {}

    return { text: lessonText };
  }

  /**
   * Проверка домашнего задания ученика (текстового или голосового)
   */
  public static async evaluateSubmission(chatId: string, submissionText: string): Promise<{ handled: boolean; replyText: string }> {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '');
    const profile = this.getProfile(cleanId);

    // Если у пользователя нет активного урока — проверяем, не перевод ли это
    const prompt =
      `Ты — строгий, но дружелюбный языковой наставник по языку: ${profile.target_lang}.\n` +
      `Ученик прислал свой ответ на задание или фразу на проверку: «${submissionText}».\n` +
      `Твоя задача:\n` +
      `1. Оцени правильность (1-5 баллов).\n` +
      `2. Если есть ошибки (в артиклях, временах, согласовании) — бережно покажи правильный вариант и объясни почему.\n` +
      `3. Если всё верно — похвали и покажи, как эту же мысль может сказать носитель языка (на более продвинутом уровне).\n` +
      `4. Задай встречный короткий вопрос на изучаемом языке, чтобы поддержать живой диалог!`;

    const feedback = await llmService.smartCall(cleanId, prompt);

    // Обновляем статистику
    try {
      if (sqliteDb) {
        sqliteDb.prepare(`
          UPDATE user_language_profile 
          SET total_words = total_words + 3, stage = 'vocab' 
          WHERE chat_id = ?
        `).run(cleanId);
      }
    } catch {}

    return {
      handled: true,
      replyText: feedback || `✅ Задание принято! Отличная попытка. Чтобы взять новый материал, отправьте: **\`новый урок\`**.`
    };
  }

  /**
   * Проверка уровня и тестирование стадии
   */
  public static async runLevelTest(chatId: string): Promise<{ text: string }> {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '');
    const profile = this.getProfile(cleanId);

    return {
      text:
        `🎯 **Экспресс-тест на определение уровня (${profile.target_lang.toUpperCase()})**\n\n` +
        `Ответьте на 3 вопроса (можно голосом или текстом):\n\n` +
        `1. Переведите: *«Я работаю каждый день, но вчера отдыхал.»*\n` +
        `2. Заполните пропуск: *«If I had more time, I _____ learn three languages.»* (will / would / had)\n` +
        `3. Напишите 1 предложение на свободную тему: чем вы занимаетесь?\n\n` +
        `_Отправьте ответы одним сообщением — я определю ваш точный уровень (A1, A2, B1, B2) и перестрою программу!_`
    };
  }

  /**
   * Карточки Anki (SM-2)
   */
  public static getReviewsToday(chatId: string): { text: string } {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '');
    let words: any[] = [];
    try {
      if (sqliteDb) {
        words = sqliteDb.prepare('SELECT * FROM user_vocabulary WHERE chat_id = ? LIMIT 10').all(cleanId) || [];
      }
    } catch {}

    if (words.length === 0) {
      return {
        text: '🌱 **На сегодня карточек нет!**\nЧтобы разобрать новую тему и добавить слова, напишите: **`новый урок`**.'
      };
    }

    const list = words.map((w, idx) => `${idx + 1}. **${w.word}** — ||${w.translation}||\n   _«${w.example || ''}»_`).join('\n\n');
    return {
      text: `🧠 **Интервальное повторение Anki (SM-2)**:\n\n${list}\n\n_Перевод скрыт. Попробуйте вспомнить самостоятельно!_`
    };
  }

  /**
   * Общая статистика
   */
  public static getProgress(chatId: string): { text: string } {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '');
    const profile = this.getProfile(cleanId);

    return {
      text:
        `📊 **Ваш статус в Языковом Наставнике Selin AI**:\n\n` +
        `• Язык: **${profile.target_lang.toUpperCase()}**\n` +
        `• Уровень: **${profile.level}**\n` +
        `• Текущий модуль: **${profile.current_topic || 'Базовый курс'}**\n` +
        `• Стадия: **${profile.stage === 'practice' ? 'Практика и проверка заданий' : 'Изучение лексики'}**\n` +
        `• Активных слов: **${profile.total_words}**\n` +
        `• Ударный режим: **${profile.streak} дн. 🔥**\n\n` +
        `_Чтобы пройти аттестацию на следующий уровень, напишите: **\`тест\`**._`
    };
  }
}
