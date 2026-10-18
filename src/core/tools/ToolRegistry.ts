/**
 * Selin AI — Суверенный Реестр Инструментов (Sovereign Tool Registry)
 * 
 * Реализует архитектурный закон 1.1 («Туннель, а не Память»):
 * Движок рассуждений вызывает программные туннели для получения данных и действий.
 * Принцип 1.2: При ошибке туннеля возвращаются статусы DATA_NOT_FOUND или TOOL_ERROR без додумывания.
 */

import { logger } from '../../logger';

export interface ToolParameterSchema {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
  handler: (args: Record<string, any>) => Promise<ToolExecutionOutput> | ToolExecutionOutput;
}

export interface ToolExecutionOutput {
  status: 'SUCCESS' | 'DATA_NOT_FOUND' | 'TOOL_ERROR';
  tool: string;
  resultData?: any;
  displayText: string;
  voiceText?: string;
  errorMessage?: string;
}

export class ToolRegistry {
  private static tools: Map<string, ToolDefinition> = new Map();

  /**
   * Регистрация исполняемого инструмента в суверенном реестре
   */
  public static register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.info(`🔧 [ToolRegistry] Зарегистрирован туннель: ${tool.name}`);
  }

  public static getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public static hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  public static getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public static getToolsSchemaForLLM(): any[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  /**
   * Вызов инструмента через защищённый туннель
   */
  public static async executeTool(name: string, args: Record<string, any>): Promise<ToolExecutionOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      logger.warn(`⚠️ [ToolRegistry] Туннель не найден: ${name}`);
      return {
        status: 'DATA_NOT_FOUND',
        tool: name,
        errorMessage: `Туннель ${name} не зарегистрирован`,
        displayText: `Инструмент ${name} не найден в локальном контуре.`
      };
    }

    try {
      logger.info(`⚡ [ToolRegistry] Выполнение туннеля: ${name}`, { args });
      return await tool.handler(args);
    } catch (err: any) {
      logger.error(`❌ [ToolRegistry] Ошибка туннеля ${name}:`, err);
      return {
        status: 'TOOL_ERROR',
        tool: name,
        errorMessage: err?.message || String(err),
        displayText: `Ошибка при обращении к туннелю ${name}.`
      };
    }
  }

  public static clear(): void {
    this.tools.clear();
  }
}
