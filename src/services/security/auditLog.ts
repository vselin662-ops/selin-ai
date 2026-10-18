import fs from 'fs';
import path from 'path';
import { logger } from '../../logger';

export interface AuditSecurityEvent {
  userId?: string;
  chatId?: string | number;
  action: 'login' | 'payment' | 'subscription_change' | 'admin_action' | 'api_access' | 'prompt_injection_blocked';
  ip?: string;
  metadata?: Record<string, any>;
}

const LOG_DIR = path.join(process.cwd(), 'data', 'audit');

try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  logger.warn('⚠️ [AuditLog] Could not initialize audit log directory:', err);
}

/**
 * Логирование критических событий безопасности в JSONL
 */
export function logSecurityEvent(event: AuditSecurityEvent): void {
  try {
    const logEntry = {
      ...event,
      timestamp: new Date().toISOString()
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `audit-${dateStr}.jsonl`);

    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    logger.info(`🛡️ [SecurityAudit] Action: ${event.action} logged.`);
  } catch (err) {
    logger.error('❌ [SecurityAudit] Error writing security event:', err);
  }
}
