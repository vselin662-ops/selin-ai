// src/adapters/max/utils/idSanitizer.ts
import { logger } from '../../../logger';

const VALID_CHAT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates and sanitizes chat/user identifiers.
 * Strictly checks that ID conforms to /^[a-zA-Z0-9_-]+$/.
 */
export function validateChatId(id: unknown): string {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return String(Math.floor(id));
  }
  if (typeof id !== 'string') {
    logger.warn('[idSanitizer] Non-string/non-number ID provided, returning empty string', { id });
    return '';
  }
  const trimmed = id.trim();
  if (!VALID_CHAT_ID_REGEX.test(trimmed)) {
    logger.warn('[idSanitizer] Chat ID does not match valid pattern', { id: trimmed });
    return '';
  }
  return trimmed;
}

/**
 * Converts sanitized chatId into a numeric ID when needed.
 */
export function parseNumericId(chatId: string): number {
  const numeric = parseInt(chatId, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}
