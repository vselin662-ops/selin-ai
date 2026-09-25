/**
 * Selin AI — Суверенный Когнитивный Оркестратор (Sovereign Cognitive Orchestrator)
 * Проект: selin-ai-app | Версия: 1.0
 * 
 * Реализует:
 * - Раздел 1.1: Принцип «Туннеля, а не Памяти»
 * - Раздел 1.2: Принцип нулевых галлюцинаций (статусы DATA_NOT_FOUND, TOOL_ERROR)
 * - Раздел 1.3: Суверенитет данных (152-ФЗ, PII Scrubber)
 * - Раздел 1.5: Структурированный машиночитаемый вывод
 * - Раздел 3: ReAct-протокол
 */

import { ToolRegistry, ToolExecutionOutput } from '../tools/ToolRegistry';
import { VoiceRenderer } from './VoiceRenderer';
import { scrubTextPII } from '../../utils/security';
import { logger } from '../../logger';

export interface StructuredCognitiveOutput {
  status: 'SUCCESS' | 'DATA_NOT_FOUND' | 'TOOL_ERROR' | 'FALLBACK';
  tool?: string;
  thought?: string;
  action?: string;
  observation?: any;
  text: string;
  voiceText: string;
}

export class CognitiveOrchestrator {
  /**
   * Центральная точка выполнения ReAct-цикла оркестратора
   */
  public static async process(userPrompt: string, context?: { chatId?: string; isVoice?: boolean }): Promise<StructuredCognitiveOutput> {
    const rawPrompt = (userPrompt || '').trim();
    if (!rawPrompt) {
      return {
        status: 'SUCCESS',
        text: 'Ожидаю команду или задачу для выполнения.',
        voiceText: 'Ожидаю команду или задачу для выполнения.'
      };
    }

    // Раздел 1.3: Де-идентификация персональных данных (152-ФЗ)
    const sanitizedPrompt = scrubTextPII(rawPrompt);

    // Раздел 3: ReAct-цикл (Рассуждение → Действие → Наблюдение → Синтез)
    // Проверка наличия зарегистрированных туннелей в реестре
    const tools = ToolRegistry.getAllTools();
    if (tools.length > 0) {
      for (const tool of tools) {
        if (sanitizedPrompt.toLowerCase().includes(tool.name.toLowerCase())) {
          logger.info(`⚡ [CognitiveOrchestrator] ReAct Action: вызов туннеля ${tool.name}`);
          const execRes: ToolExecutionOutput = await ToolRegistry.executeTool(tool.name, { input: sanitizedPrompt });
          
          return {
            status: execRes.status,
            tool: tool.name,
            action: tool.name,
            observation: execRes.resultData,
            text: VoiceRenderer.renderForText(execRes.displayText),
            voiceText: VoiceRenderer.renderForVoice(execRes.voiceText || execRes.displayText)
          };
        }
      }
    }

    // Если прямого туннеля не вызвано — возвращаем статус FALLBACK для передачи в локальную LLM
    return {
      status: 'FALLBACK',
      text: sanitizedPrompt,
      voiceText: VoiceRenderer.renderForVoice(sanitizedPrompt)
    };
  }
}
