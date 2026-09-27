// src/adapters/max/utils/textNormalizer.ts
import { cleanForMax as sharedCleanForMax } from '../../../utils/textUtils';

/**
 * Cleans markdown formatting, emojis and special control characters for MAX Messenger output.
 */
export function cleanForMax(text: string): string {
  if (!text) return '';
  return sharedCleanForMax(text);
}

/**
 * Splits text into chunks respecting MAX Messenger limits (max length 3800, strict sentence splitting).
 */
export function splitTextSmart(text: string, maxLength = 3800): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining.trim());
      break;
    }

    let splitIndex = -1;

    // Ищем знак конца предложения (точка, восклицательный или вопросительный знак) с последующим пробелом
    const sentenceRegex = /[.!?]\s/g;
    let match;
    while ((match = sentenceRegex.exec(remaining)) !== null) {
      if (match.index + 1 <= maxLength) {
        splitIndex = match.index + 1; // Режем сразу после знака пунктуации
      } else {
        break;
      }
    }

    // Фолбэк 1: перевод строки
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf('\n', maxLength);
    }

    // Фолбэк 2: пробел между словами (чтобы не резать слово посередине)
    if (splitIndex === -1 || splitIndex < maxLength * 0.4) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }

    // Экстремальный фолбэк: жесткий лимит
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    const chunk = remaining.slice(0, splitIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}

/**
 * Prepares raw text for voice synthesis (TTS) by removing technical symbols and markdown.
 */
export function prepareVoiceText(text: string): string {
  if (!text) return '';
  let cleaned = text
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove links
    .replace(/[*_~#>]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize numbers, punctuation for natural TTS prosody
  cleaned = cleaned.replace(/№\s*(\d+)/g, 'номер $1');
  return cleaned;
}

/**
 * Normalizes user spoken text (transcribed from STT) to standard commands.
 */
export function normalizeForVoice(text: string): string {
  if (!text) return '';
  return text.trim().toLowerCase();
}
