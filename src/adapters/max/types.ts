// src/adapters/max/types.ts

export interface MaxAttachment {
  type?: string;
  payload?: {
    url?: string;
    token?: string;
    latitude?: number;
    longitude?: number;
    lat?: number;
    lon?: number;
    title?: string;
    caption?: string;
    duration?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MaxMessage {
  mid?: string;
  seq?: string | number;
  text?: string;
  sender?: { user_id?: string | number; id?: string | number; name?: string };
  recipient?: { chat_id?: string | number };
  attachments?: MaxAttachment[];
  timestamp?: number;
  [key: string]: unknown;
}

export interface MaxWebhookPayload {
  update_type?: string;
  type?: string;
  event?: string;
  mid?: string;
  chat_id?: string | number;
  user_id?: string | number;
  body?: {
    mid?: string;
    seq?: string | number;
    text?: string;
    user?: { user_id?: string | number; id?: string | number; name?: string };
    sender?: { user_id?: string | number; id?: string | number; name?: string };
    attachments?: MaxAttachment[];
    message?: MaxMessage;
    callback_id?: string;
    payload?: string;
    [key: string]: unknown;
  };
  payload?: {
    callback_id?: string;
    payload?: string;
    data?: string;
    [key: string]: unknown;
  };
  message?: MaxMessage;
  callback_data?: string;
  callback_id?: string;
  [key: string]: unknown;
}

export interface ParsedAttachments {
  hasImage: boolean;
  imageUrl?: string;
  hasAudio: boolean;
  audioUrl?: string;
  hasLocation: boolean;
  latitude?: number;
  longitude?: number;
}

export interface HandlerContext {
  raw: MaxWebhookPayload;
  chatId: string;
  numericId: number;
  text: string;
  lowerText: string;
  isVoiceInput: boolean;
  isOwner: boolean;
  hasImage: boolean;
  imageUrl?: string;
  hasLocation: boolean;
  userLat?: number;
  userLon?: number;
  callbackData?: string;
  isCallbackUpdate: boolean;
}

export interface HandlerResult {
  handled: boolean;
  replyText?: string;
  voiceText?: string;
  extra?: Record<string, unknown>;
}

export interface IMessageHandler {
  readonly name: string;
  readonly priority: number;
  canHandle(ctx: HandlerContext): boolean;
  handle(ctx: HandlerContext): Promise<HandlerResult>;
}

export interface EngineContext {
  chatId: string;
  userId?: string;
  tenantId?: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface EngineResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageOptions {
  voice?: boolean;
  attachments?: unknown[];
  extra?: Record<string, unknown>;
  replyToMid?: string;
}
