// src/engines/DiagnosticEngine.ts
import { logger } from '../logger';

export interface DiagnosticReport {
  timestamp: number;
  uptimeSeconds: number;
  heapUsedMb: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  issues: string[];
}

export interface LogPatternResult {
  errorCount: number;
  warnCount: number;
  detectedPatterns: string[];
}

export class DiagnosticEngine {
  public static runDiagnostics(): DiagnosticReport {
    try {
      const memory = process.memoryUsage();
      const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
      const uptimeSeconds = Math.round(process.uptime());
      const issues: string[] = [];

      if (heapUsedMb > 1024) {
        issues.push(`Высокое потребление памяти: ${heapUsedMb} МБ`);
      }

      const status: DiagnosticReport['status'] = issues.length === 0 ? 'HEALTHY' : 'DEGRADED';
      logger.info(`[DiagnosticEngine] Health check: ${status}, Heap: ${heapUsedMb}MB, Uptime: ${uptimeSeconds}s`);

      return {
        timestamp: Date.now(),
        uptimeSeconds,
        heapUsedMb,
        status,
        issues
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[DiagnosticEngine] Failed to run diagnostics: ${msg}`);
      return {
        timestamp: Date.now(),
        uptimeSeconds: 0,
        heapUsedMb: 0,
        status: 'CRITICAL',
        issues: [msg]
      };
    }
  }

  public static analyzeLogs(logLines: string[]): LogPatternResult {
    let errorCount = 0;
    let warnCount = 0;
    const detectedPatterns: string[] = [];

    for (const line of logLines) {
      if (/error|fail|exception/i.test(line)) {
        errorCount++;
        if (/timeout/i.test(line) && !detectedPatterns.includes('TIMEOUT_SPIKE')) {
          detectedPatterns.push('TIMEOUT_SPIKE');
        }
        if (/connection|refused|econnrefused/i.test(line) && !detectedPatterns.includes('NETWORK_DOWN')) {
          detectedPatterns.push('NETWORK_DOWN');
        }
      } else if (/warn/i.test(line)) {
        warnCount++;
      }
    }

    return {
      errorCount,
      warnCount,
      detectedPatterns
    };
  }
}
