/**
 * Selin AI 2.0 Services Module
 * Экспорт всех вспомогательных сервисов и подсистем безопасности:
 * - TTSService / stt.service: Синтез и распознавание речи
 * - flight.service: Поиск авиабилетов и гостиниц
 * - rag-protection: Защита контекста RAG и санитизация
 * - jailbreak-detector / canary-tokens: Обнаружение атак и канареечные токены
 * - output-filter / mcp-guardian: Фильтрация ответов и валидация MCP-инструментов
 * - agent-monitor / trust-engine: Метрики, скоринг доверия и мониторинг
 * - gemini.service / max-bot.service: Интеграционные сервисы
 */

export * from './voice/TTSService';
export * from './voice/stt.service';
export * from './flight.service';
export * from './security/rag-protection';
export * from './security/jailbreak-detector';
export * from './security/canary-tokens';
export * from './security/output-filter';
export * from './security/mcp-guardian';
export * from './ai/agent-monitor';
export * from './security/trust-engine';
export * from './ai/gemini.service';
export * from './max-bot.service';
export * from './ai/aiOrchestrator';
export * from './ai/WebSearchService';
export * from './presentation/presentationService';
export * from './BookNarrationService';

