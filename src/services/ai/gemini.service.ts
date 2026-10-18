import { llmService } from '../../core/LLMService';
import { logger } from '../../logger';

/**
 * Сервис для взаимодействия с LLM (ранее Gemini API, теперь суверенный Ollama/Cloud.ru).
 */
class GeminiService {
  /**
   * Генерирует текстовый ответ с помощью суверенной модели.
   *
   * @param prompt - Входной промпт
   * @param options - Дополнительные параметры (температура, модель)
   * @returns Сгенерированный текст
   */
  async generate(prompt: string, options: { temperature?: number; model?: string } = {}): Promise<string> {
    try {
      const response = await llmService.call([{ role: 'user', content: prompt }]);
      return response || '';
    } catch (err) {
      logger.error('Error generating text with Sovereign LLM', { error: err });
      throw err;
    }
  }
}

export const geminiService = new GeminiService();
