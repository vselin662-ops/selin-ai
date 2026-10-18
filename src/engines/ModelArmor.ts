// src/engines/ModelArmor.ts
import { logger } from '../logger';

export interface ScanResult {
  passed: boolean;
  sanitizedText: string;
  threatType?: 'PROMPT_INJECTION' | 'PII_LEAK' | 'CREDENTIAL_LEAK' | 'JAILBREAK';
  confidence: number;
}

export class ModelArmor {
  private static readonly INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /system\s+prompt\s+override/i,
    /you\s+are\s+now\s+in\s+developer\s+mode/i,
    /jailbreak/i,
    /dan\s+mode/i,
    /забудь\s+(все\s+)?предыдущие\s+инструкции/i,
    /режим\s+разработчика/i,
    /раскрой\s+системный\s+промпт/i
  ];

  private static readonly PII_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;
  private static readonly PII_PASSPORT_REGEX = /\b\d{2}\s?\d{2}\s?\d{6}\b/g;
  private static readonly PII_PHONE_REGEX = /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
  private static readonly JWT_REGEX = /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g;

  public static sanitizeInput(input: string): ScanResult {
    try {
      for (const pattern of this.INJECTION_PATTERNS) {
        if (pattern.test(input)) {
          logger.warn(`[ModelArmor] Prompt injection detected: ${pattern}`);
          return {
            passed: false,
            sanitizedText: input,
            threatType: 'PROMPT_INJECTION',
            confidence: 0.95
          };
        }
      }

      let sanitized = input;
      sanitized = sanitized.replace(this.JWT_REGEX, '[PROTECTED_JWT]');
      sanitized = sanitized.replace(this.PII_CARD_REGEX, '[CARD_NUMBER_MASKED]');
      sanitized = sanitized.replace(this.PII_PASSPORT_REGEX, '[PASSPORT_MASKED]');

      return {
        passed: true,
        sanitizedText: sanitized,
        confidence: 1.0
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ModelArmor] Error inspecting input: ${msg}`);
      return { passed: false, sanitizedText: '', threatType: 'JAILBREAK', confidence: 1.0 };
    }
  }

  // Alias for backward compatibility
  public static inspectInput(input: string): ScanResult {
    return this.sanitizeInput(input);
  }

  public static sanitizeOutput(output: string): string {
    try {
      let safeOutput = output;
      safeOutput = safeOutput.replace(this.JWT_REGEX, '[REDACTED_SECRET]');
      safeOutput = safeOutput.replace(this.PII_CARD_REGEX, '[REDACTED_CARD]');
      return safeOutput;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ModelArmor] Error inspecting output: ${msg}`);
      return '[Output blocked by security policy]';
    }
  }

  // Alias for backward compatibility
  public static inspectOutput(output: string): string {
    return this.sanitizeOutput(output);
  }
}
