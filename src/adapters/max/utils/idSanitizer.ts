// src/adapters/max/utils/idSanitizer.ts
import { logger } from '../../../logger';

const VALID_CHAT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates and sanitizes chat/user identifiers.
 * Strictly checks that ID conforms to /^[a-zA-Z0-9_-]+$/.
 */
export function validateChatId(id: string | number): string {
  if (id === null || id === undefined) {
    throw new Error('Недопустимый формат chatId');
  }
  const strId = String(id).trim();
  if (!VALID_CHAT_ID_REGEX.test(strId)) {
    throw new Error('Недопустимый формат chatId');
  }
  return strId;
}

/**
 * Converts sanitized chatId into a numeric ID when needed.
 */
export function parseNumericId(chatId: string): number {
  const numeric = parseInt(chatId, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}
