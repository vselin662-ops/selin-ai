import type { Adapter, InputEvent, VoiceInputEvent, SensorEvent, RobotAction } from '../adapters/base.adapter';
import { memorySystem, type Memory } from './memory';
import { ttsService, synthesizeForChat } from '../services/voice/TTSService';
import { processMessage as processLanguageMessage, startLesson } from '../modules/language/language.module';
import { businessModule } from '../modules/business';
import { servicesModule } from '../modules/services';
import { knowledgeModule } from '../modules/knowledge';
import { contentModule } from '../modules/content';
import { entertainmentModule } from '../modules/entertainment';
import { healthModule } from '../modules/health';
import { financeModule } from '../modules/finance';
import { socialModule } from '../modules/social';
import { robotModule } from '../modules/robot';
import { logger } from '../logger';
import { llmService } from './LLMService';

export interface Intent {
  type: string;
  confidence: number;
  entities: Record<string, any>;
  raw_text: string;
}

export interface Action {
  type: string;
  payload: Record<string, any>;
  priority: number;
}

/**
 * Главный Оркестратор автономного интеллекта Selin AI.
 * Единственная точка входа, связывающая ядро с адаптерами и модулями.
 */
export class Orchestrator {
  private adapters: Map<string, Adapter> = new Map();

  registerAdapter(adapter: Adapter): void {
    this.adapters.set(adapter.name, adapter);

    adapter.onMessage(async (event) => {
      await this.processInput(event);
    });

    adapter.onVoice(async (event) => {
      // Имитация транскрипции или использование существующего STT
      const text = event.transcription || event.text || 'Привет Selin';
      await this.processInput({ ...event, text });
    });

    if (adapter.onSensor) {
      adapter.onSensor(async (event) => {
        await this.processSensorEvent(event, adapter.name);
      });
    }

    logger.info(`[Orchestrator] Registered adapter: ${adapter.name}`);
  }

  getAdapter(name: string): Adapter | undefined {
    return this.adapters.get(name);
  }

  async processInput(event: InputEvent): Promise<string> {
    logger.info('[Orchestrator] Processing input event', { adapter: event.adapterName, user: event.userId, text: event.text });

    const context = await memorySystem.getContext(event.tenantId);
    memorySystem.addMessage(event.tenantId, 'user', event.text);

    const primaryResponse = await llmService.smartCall(event.userId || event.tenantId, event.text);

    memorySystem.addMessage(event.tenantId, 'assistant', primaryResponse);

    const adapter = this.adapters.get(event.adapterName);
    if (adapter) {
      await adapter.sendText(event.userId, primaryResponse);
    }

    return primaryResponse;
  }

  private async routeToModule(intent: Intent, memory: Memory): Promise<string> {
    switch (intent.type) {
      case 'learn_language':
        return await processLanguageMessage(memory.context.tenantId, intent.raw_text);
      case 'business_help':
        return (await businessModule.processIntent(intent, memory)).text;
      case 'order_taxi':
      case 'order_food':
      case 'book_hotel':
      case 'search_flights':
      case 'service_request':
        return (await servicesModule.processIntent(intent, memory)).text;
      case 'content_plan':
        return (await contentModule.processIntent(intent, memory)).text;
      case 'robot_command':
      case 'navigation':
        return (await robotModule.processIntent(intent, memory)).text;
      case 'entertainment':
        return (await entertainmentModule.processIntent(intent, memory)).text;
      default:
        return (await knowledgeModule.processIntent(intent, memory)).text;
    }
  }

  private async executeAction(
    action: Action,
    event: InputEvent,
    intent: Intent,
    memory: Memory
  ): Promise<string | null> {
    const adapter = this.adapters.get(event.adapterName);

    switch (action.type) {
      case 'respond_text': {
        const text = (action.payload.text as string) || (await this.routeToModule(intent, memory));
        if (adapter) {
          await adapter.sendText(event.userId, text);
        }
        return text;
      }

      case 'respond_voice': {
        const text = action.payload.text as string;
        if (adapter) {
          const audio = await synthesizeForChat(event.userId, text);
          if (audio) {
            await adapter.sendVoice(event.userId, audio);
          } else {
            await adapter.sendText(event.userId, text);
          }
        }
        return text;
      }

      case 'start_lesson': {
        const lesson = await startLesson(event.tenantId);
        if (adapter) {
          await adapter.sendText(event.userId, lesson.text);
        }
        return lesson.text;
      }

      case 'control_robot': {
        if (adapter && adapter.sendAction) {
          await adapter.sendAction(event.userId, {
            type: 'show_emotion',
            params: { emotion: 'listening', text: event.text },
          });
        }
        return null;
      }

      default:
        return null;
    }
  }

  private async processSensorEvent(event: SensorEvent, adapterName: string): Promise<void> {
    logger.info('[Orchestrator] Received sensor event from robot', { adapterName, type: event.type });
    if (event.type === 'face_detected' || event.type === 'guest_arrived') {
      const adapter = this.adapters.get(adapterName);
      if (adapter) {
        await adapter.sendText('guest', 'Здравствуйте! Добро пожаловать! Я Selin AI. Чем могу помочь?');
        if (adapter.sendAction) {
          await adapter.sendAction('guest', {
            type: 'show_emotion',
            params: { emotion: 'welcome' },
          });
        }
      }
    }
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.start();
    }
    logger.info('[Orchestrator] All registered adapters started');
  }

  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
    logger.info('[Orchestrator] All registered adapters stopped');
  }
}

export const orchestrator = new Orchestrator();
