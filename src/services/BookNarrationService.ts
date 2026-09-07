import { sqliteDb } from '../../db';
import { aiOrchestrator } from './aiOrchestrator';
import { logger } from '../logger';

export interface BookState {
  chatId: string;
  bookTitle: string;
  bookAuthor: string;
  currentChapter: number;
  isActive: boolean;
}

/**
 * Сервис озвучки книг (Selin_AI)
 */
export class BookNarrationService {
  private static initialized = false;

  public static init(): void {
    if (this.initialized) return;
    if (sqliteDb) {
      try {
        sqliteDb.exec(`
          CREATE TABLE IF NOT EXISTS book_narration_states (
            chat_id TEXT PRIMARY KEY,
            book_title TEXT NOT NULL,
            book_author TEXT,
            current_chapter INTEGER NOT NULL DEFAULT 1,
            is_active INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
          )
        `);
        this.initialized = true;
        logger.info('📚 [BookNarrationService] Table book_narration_states initialized successfully.');
      } catch (err: any) {
        logger.error(`❌ [BookNarrationService] Error creating table: ${err?.message || err}`);
      }
    }
  }

  /**
   * Распознавание названия книги и автора из запроса
   */
  public static async parseBookRequest(text: string): Promise<{ title: string; author: string } | null> {
    const prompt = `Внимательно проанализируй запрос пользователя на озвучку книги: "${text}".
Определи название книги и автора. Если автор не упомянут, попробуй определить его по названию книги.

Верни строго JSON-объект в следующем формате:
{
  "title": "название книги на русском языке",
  "author": "имя и фамилия автора на русском языке (или пусто, если невозможно определить)"
}
Ничего другого не пиши, не оборачивай в дополнительные теги, кроме стандартного блока кода json. Если запрос вообще не относится к книге, верни {"title": "", "author": ""}.`;

    try {
      const response = await aiOrchestrator.getResponse(prompt, "Ты — эксперт-библиограф. Помогаешь распознавать книги по запросам.");
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && parsed.title && parsed.title.trim()) {
        return {
          title: parsed.title.trim(),
          author: parsed.author ? parsed.author.trim() : ''
        };
      }
    } catch (err: any) {
      logger.warn(`⚠️ [BookNarrationService] Error parsing book request: ${err?.message || err}`);
    }
    return null;
  }

  /**
   * Проверка доступности книги в открытых источниках
   */
  public static async checkBookAvailability(title: string, author: string): Promise<{ isAvailable: boolean; purchaseLink?: string }> {
    const prompt = `Определи, находится ли книга "${title}" (автор: ${author}) в свободном бесплатном доступе (например, общественное достояние или бесплатная легальная библиотека).
Если книга защищена авторским правом и не распространяется бесплатно легально, верни {"isAvailable": false, "purchaseLink": "ссылка на Литрес или другой магазин"}.
Если книга доступна бесплатно, верни {"isAvailable": true}.

Формат ответа СТРОГО JSON:
{
  "isAvailable": boolean,
  "purchaseLink": "https://www.litres.ru/... или пустая строка"
}`;

    try {
      const response = await aiOrchestrator.getResponse(prompt, "Ты — юридический и библиографический эксперт по авторскому праву.");
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        isAvailable: !!parsed.isAvailable,
        purchaseLink: parsed.purchaseLink || `https://www.litres.ru/search/?q=${encodeURIComponent(title + ' ' + author)}`
      };
    } catch (err: any) {
      logger.warn(`⚠️ [BookNarrationService] Error checking book availability: ${err?.message || err}`);
      // Фолбэк: если это классика, считаем доступной
      const lowerTitle = title.toLowerCase();
      const isClassic = lowerTitle.includes('мастер и маргарита') || 
                        lowerTitle.includes('война и мир') || 
                        lowerTitle.includes('преступление и наказание') || 
                        lowerTitle.includes('евгений онегин') ||
                        lowerTitle.includes('мертвые души');
      return {
        isAvailable: isClassic,
        purchaseLink: `https://www.litres.ru/search/?q=${encodeURIComponent(title + ' ' + author)}`
      };
    }
  }

  /**
   * Получение аутентичного текста главы книги
   */
  public static async getChapterText(title: string, author: string, chapterNumber: number): Promise<string | null> {
    const prompt = `Ты — профессиональный чтец аудиокниг. Предоставь оригинальный текст главы ${chapterNumber} книги "${title}" (автор: ${author}) на русском языке.
Текст должен быть аутентичным, без сокращений, красивым и выразительным. Длина текста должна быть в пределах 1500-2500 символов (художественный отрывок начала главы ${chapterNumber}, который идеально воспринимается на слух за 1-2 минуты).

Начни ответ СРАЗУ с текста книги (например: "Глава ${chapterNumber}. ..."). Никаких приветствий, метаданных или примечаний. Только оригинальный текст.`;

    try {
      const text = await aiOrchestrator.getResponse(prompt, "Ты — профессиональный диктор. Твоя роль — читать оригинальные книги без отсебятины.");
      if (text && text.trim().length > 100) {
        return text.trim();
      }
    } catch (err: any) {
      logger.error(`❌ [BookNarrationService] Error fetching chapter text: ${err?.message || err}`);
    }
    return null;
  }

  // === Методы сохранения состояния ===

  public static saveState(chatId: string, title: string, author: string, chapterNumber: number, isActive: boolean): void {
    this.init();
    if (sqliteDb) {
      try {
        const now = new Date().toISOString();
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO book_narration_states (chat_id, book_title, book_author, current_chapter, is_active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(chatId, title, author, chapterNumber, isActive ? 1 : 0, now);
      } catch (err: any) {
        logger.error(`❌ [BookNarrationService] Error saving state: ${err?.message || err}`);
      }
    }
  }

  public static getState(chatId: string): BookState | null {
    this.init();
    if (sqliteDb) {
      try {
        const row = sqliteDb.prepare("SELECT * FROM book_narration_states WHERE chat_id = ?").get(chatId);
        if (row) {
          return {
            chatId: row.chat_id,
            bookTitle: row.book_title,
            bookAuthor: row.book_author,
            currentChapter: row.current_chapter,
            isActive: row.is_active === 1
          };
        }
      } catch (err: any) {
        logger.error(`❌ [BookNarrationService] Error getting state: ${err?.message || err}`);
      }
    }
    return null;
  }

  public static clearState(chatId: string): void {
    this.init();
    if (sqliteDb) {
      try {
        sqliteDb.prepare("DELETE FROM book_narration_states WHERE chat_id = ?").run(chatId);
      } catch (err: any) {
        logger.error(`❌ [BookNarrationService] Error clearing state: ${err?.message || err}`);
      }
    }
  }
}
