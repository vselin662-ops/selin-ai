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
 * Splits text into chunks respecting MAX Messenger limits (usually 4000 characters).
 */
export function splitTextSmart(text: string, maxLength = 3900): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf('. ', maxLength);
      if (splitIndex !== -1) splitIndex += 1;
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
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
