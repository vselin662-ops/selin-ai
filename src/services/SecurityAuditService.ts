import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

export interface AuditEntry {
  timestamp: string;
  chatId: string;
  action: string;
  command?: string;
  ip?: string;
  status: 'success' | 'blocked' | 'failed';
  details?: string;
}

export class SecurityAuditService {
  private static logPath = path.join(process.cwd(), 'data', 'security_audit.log');

  /**
   * Запись критического события безопасности
   */
  public static async logEvent(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    const logLine = JSON.stringify(fullEntry) + '\n';
    
    try {
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.logPath, logLine);
      
      if (entry.status === 'blocked') {
        logger.warn(`🚨 [SECURITY BLOCK] ${entry.action}: ${entry.command || entry.details}`);
      } else {
        logger.info(`🛡️ [AUDIT] ${entry.action}`);
      }
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }

  /**
   * Получение последних N событий аудита
   */
  public static getRecentEvents(limit: number = 50): AuditEntry[] {
    try {
      if (!fs.existsSync(this.logPath)) return [];
      const content = fs.readFileSync(this.logPath, 'utf8');
      return content
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
        .reverse()
        .slice(0, limit);
    } catch {
      return [];
    }
  }
}
