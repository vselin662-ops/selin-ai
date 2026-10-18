// src/adapters/MaxAdapter.ts
/**
 * Modern facade for MaxAdapter v2.
 * Re-exports the modular architecture from ./max to maintain 100% backward compatibility.
 */
export { MaxAdapter } from './max/MaxAdapter';
export { MaxWebhookRouter } from './max/MaxWebhookRouter';
export { MaxSender } from './max/services/maxSender';
export { DeduplicationStore } from './max/services/DeduplicationStore';
export {
  runImageGenSelfTest,
  buildImagePrompt,
  parseImageSize
} from './max/services/ImageUploader';
export { validateChatId, parseNumericId } from './max/utils/idSanitizer';
export {
  cleanForMax,
  splitTextSmart,
  prepareVoiceText,
  normalizeForVoice
} from './max/utils/textNormalizer';
export { parseAttachments } from './max/utils/attachmentParser';
export * from './max/types';
