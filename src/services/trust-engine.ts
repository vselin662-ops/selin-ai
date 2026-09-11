import { logger } from "../logger";

interface TrustSession {
  score: number;
  lastActive: number;
  restrictedMode: boolean;
}

const trustStore = new Map<string, TrustSession>();
const ONE_DAY = 24 * 60 * 60 * 1000;

export function isOwnerAccount(tenantId: string): boolean {
  if (!tenantId) return false;
  const ownerEnv = String(process.env.OWNER_CHAT_ID || '').trim();
  const normalized = String(tenantId).trim().toLowerCase();
  return (
    normalized === 'owner' ||
    normalized === 'admin' ||
    normalized === 'vselin662@gmail.com' ||
    normalized.startsWith('owner_') ||
    normalized.includes('owner') ||
    (ownerEnv !== '' && (tenantId === ownerEnv || normalized === ownerEnv.toLowerCase()))
  );
}

export function resetOwnerTrust(): void {
  for (const [key, session] of trustStore.entries()) {
    if (isOwnerAccount(key)) {
      session.score = 100;
      session.restrictedMode = false;
      trustStore.set(key, session);
    }
  }
}

export function getTrustSession(tenantId: string): TrustSession {
  const now = Date.now();

  // Владелец навсегда освобождён от trust engine и restricted mode
  if (isOwnerAccount(tenantId)) {
    const ownerSession: TrustSession = {
      score: 100,
      lastActive: now,
      restrictedMode: false,
    };
    trustStore.set(tenantId, ownerSession);
    return ownerSession;
  }

  const session = trustStore.get(tenantId);

  if (!session || now - session.lastActive > ONE_DAY) {
    const newSession: TrustSession = {
      score: 100,
      lastActive: now,
      restrictedMode: false,
    };
    trustStore.set(tenantId, newSession);
    return newSession;
  }

  session.lastActive = now;
  return session;
}

export function deductTrustScore(tenantId: string, penalty: number, reason: string): TrustSession {
  // Владелец навсегда освобождён от снижения доверия
  if (isOwnerAccount(tenantId)) {
    return {
      score: 100,
      lastActive: Date.now(),
      restrictedMode: false,
    };
  }

  const session = getTrustSession(tenantId);
  session.score = Math.max(0, session.score - penalty);
  
  if (session.score < 30) {
    session.restrictedMode = true;
    logger.warn(`⚠️ User ${tenantId} trust score dropped to ${session.score}. Entering RESTRICTED MODE. Reason: ${reason}`);
  } else {
    logger.info(`Deducted ${penalty} trust points for ${tenantId}. Current score: ${session.score}. Reason: ${reason}`);
  }

  trustStore.set(tenantId, session);
  return session;
}

export function recordNormalRequest(tenantId: string): TrustSession {
  if (isOwnerAccount(tenantId)) {
    return {
      score: 100,
      lastActive: Date.now(),
      restrictedMode: false,
    };
  }

  const session = getTrustSession(tenantId);
  if (session.score < 100) {
    session.score = Math.min(100, session.score + 5);
    if (session.score >= 30 && session.restrictedMode) {
      session.restrictedMode = false;
      logger.info(`✅ User ${tenantId} restored trust score to ${session.score}. Exited RESTRICTED MODE.`);
    }
  }
  trustStore.set(tenantId, session);
  return session;
}

export function isRestrictedMode(tenantId: string): boolean {
  if (isOwnerAccount(tenantId)) {
    return false;
  }
  return getTrustSession(tenantId).restrictedMode;
}

