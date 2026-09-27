// src/engines/CryptographicAudit.ts
import crypto from 'crypto';
import { logger } from '../logger';

export interface AuditRecord {
  id: string;
  timestamp: number;
  action: string;
  actorId: string;
  payloadHash: string;
  signature: string;
  metadata?: Record<string, unknown>;
}

export class CryptographicAudit {
  private static readonly SECRET = process.env.AUDIT_SIGNING_SECRET || 'selin_sovereign_audit_secret_2026';

  public static signOperation(action: string, actorId: string, payload: unknown, metadata?: Record<string, unknown>): AuditRecord {
    try {
      const timestamp = Date.now();
      const rawPayload = JSON.stringify(payload ?? {});
      const payloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

      const dataToSign = `${action}:${actorId}:${timestamp}:${payloadHash}`;
      const signature = crypto.createHmac('sha256', this.SECRET).update(dataToSign).digest('hex');

      const record: AuditRecord = {
        id: crypto.randomUUID(),
        timestamp,
        action,
        actorId,
        payloadHash,
        signature,
        metadata
      };

      logger.info(`[CryptographicAudit] Operation signed: ${action} by ${actorId}`, { id: record.id });
      return record;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CryptographicAudit] Failed to sign operation: ${msg}`);
      throw new Error(`Audit signing failed: ${msg}`);
    }
  }

  // Alias for backward compatibility
  public static signAction(action: string, actorId: string, payload: unknown, metadata?: Record<string, unknown>): AuditRecord {
    return this.signOperation(action, actorId, payload, metadata);
  }

  public static verifySignature(record: AuditRecord, originalPayload: unknown): boolean {
    try {
      const rawPayload = JSON.stringify(originalPayload ?? {});
      const expectedPayloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

      if (expectedPayloadHash !== record.payloadHash) {
        logger.warn(`[CryptographicAudit] Payload hash mismatch for record ${record.id}`);
        return false;
      }

      const dataToVerify = `${record.action}:${record.actorId}:${record.timestamp}:${record.payloadHash}`;
      const expectedSignature = crypto.createHmac('sha256', this.SECRET).update(dataToVerify).digest('hex');

      return crypto.timingSafeEqual(Buffer.from(record.signature), Buffer.from(expectedSignature));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CryptographicAudit] Verification failed: ${msg}`);
      return false;
    }
  }

  // Alias for backward compatibility
  public static verifyRecord(record: AuditRecord, originalPayload: unknown): boolean {
    return this.verifySignature(record, originalPayload);
  }
}
