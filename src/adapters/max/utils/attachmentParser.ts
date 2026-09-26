// src/adapters/max/utils/attachmentParser.ts
import { MaxAttachment, ParsedAttachments, MaxWebhookPayload } from '../types';

/**
 * Parses and extracts audio, image and location data from MAX attachments or raw webhook payload.
 */
export function parseAttachments(payload: MaxWebhookPayload): ParsedAttachments {
  const result: ParsedAttachments = {
    hasImage: false,
    hasAudio: false,
    hasLocation: false
  };

  const rawAttachments =
    payload.body?.attachments ||
    payload.body?.message?.attachments ||
    payload.message?.attachments ||
    [];

  if (Array.isArray(rawAttachments)) {
    for (const att of rawAttachments) {
      if (!att || typeof att !== 'object') continue;
      const type = typeof att.type === 'string' ? att.type.toLowerCase() : '';
      const p = att.payload && typeof att.payload === 'object' ? att.payload : {};

      // Image detection
      if (type === 'image' || type === 'photo') {
        result.hasImage = true;
        result.imageUrl = (p.url as string) || (p.token as string) || result.imageUrl;
      }

      // Audio / Voice detection
      if (type === 'audio' || type === 'voice' || type === 'audio_message') {
        result.hasAudio = true;
        result.audioUrl = (p.url as string) || (p.token as string) || result.audioUrl;
      }

      // Location detection
      if (type === 'location' || (typeof p.latitude === 'number' && typeof p.longitude === 'number')) {
        result.hasLocation = true;
        result.latitude = typeof p.latitude === 'number' ? p.latitude : (p.lat as number | undefined);
        result.longitude = typeof p.longitude === 'number' ? p.longitude : (p.lon as number | undefined);
      }
    }
  }

  return result;
}
