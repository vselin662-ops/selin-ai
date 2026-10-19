export interface Intent {
  raw_text: string;
  action?: string;
  confidence?: number;
  entities?: Record<string, any>;
  [key: string]: any;
}

export interface ConversationContext {
  tenantId: string;
  lastTopic?: string;
  userIntent?: string;
  summary?: string;
  entities?: Record<string, any>;
  lastLocation?: string;
  lastUpdated?: number;
  activeMode?: string;
  [key: string]: any;
}
