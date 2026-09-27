// src/web/middleware/security.ts
import { Request, Response, NextFunction } from 'express';
import { ModelArmor } from '../../engines/ModelArmor';
import { SemanticGovernance } from '../../engines/SemanticGovernance';
import { AnomalyDetector } from '../../engines/AnomalyDetector';
import { logger } from '../../logger';

function extractUserText(req: Request): string {
  if (!req.body || typeof req.body !== 'object') {
    return '';
  }
  const body = req.body as Record<string, unknown>;
  const textCandidate =
    body.text ||
    body.message ||
    body.prompt ||
    body.user_message ||
    body.question ||
    body.query ||
    '';
  return typeof textCandidate === 'string' ? textCandidate.trim() : '';
}

function resolveClientId(req: Request): string {
  const reqObj = req as Request & { user?: { chatId?: string | number; userId?: string | number } };
  const userChatId = reqObj.user?.chatId || reqObj.user?.userId;
  if (userChatId) {
    return String(userChatId).replace(/^[a-z_]+/, '').trim();
  }
  const headerId = req.headers['x-chat-id'] || req.headers['x-user-id'] || req.headers['x-forwarded-for'];
  if (headerId && typeof headerId === 'string') {
    return headerId.split(',')[0].trim();
  }
  return req.ip || 'anonymous_web_user';
}

/**
 * 1. webModelArmor: Проверка входящих веб-запросов через ModelArmor.
 * Защита от prompt injection, маскирование PII и учетных данных.
 */
export function webModelArmor(req: Request, res: Response, next: NextFunction): void {
  try {
    const text = extractUserText(req);
    if (!text) {
      return next();
    }

    const scan = ModelArmor.sanitizeInput(text);
    if (!scan.passed) {
      logger.warn(`🛡️ [webModelArmor] Prompt injection/threat blocked from IP: ${req.ip}, threat: ${scan.threatType}`);
      res.status(400).json({
        error: 'Security Policy Violation',
        message: 'Ваш запрос был заблокирован системой безопасности из-за потенциально опасного содержимого.'
      });
      return;
    }

    // Заменяем поля на санитизированную версию
    if (req.body && typeof req.body === 'object') {
      const body = req.body as Record<string, unknown>;
      if (typeof body.text === 'string') body.text = scan.sanitizedText;
      if (typeof body.message === 'string') body.message = scan.sanitizedText;
      if (typeof body.prompt === 'string') body.prompt = scan.sanitizedText;
      if (typeof body.user_message === 'string') body.user_message = scan.sanitizedText;
      if (typeof body.question === 'string') body.question = scan.sanitizedText;
      if (typeof body.query === 'string') body.query = scan.sanitizedText;
    }

    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[webModelArmor] Exception: ${msg}`);
    next();
  }
}

/**
 * 2. webSemanticGuard: Семантическая проверка намерений в веб-чате.
 * Блокировка деструктивных и недопустимых тем через SemanticGovernance.
 */
export function webSemanticGuard(req: Request, res: Response, next: NextFunction): void {
  try {
    const text = extractUserText(req);
    if (!text) {
      return next();
    }

    const evaluation = SemanticGovernance.evaluateIntent(text);
    if (!evaluation.allowed) {
      logger.warn(`🛡️ [webSemanticGuard] Semantic intent rejected for IP: ${req.ip}, reason: ${evaluation.reason}`);
      res.status(403).json({
        error: 'Semantic Governance Restriction',
        message: evaluation.reason || 'Запрос содержит недопустимую тему или деструктивный сценарий.'
      });
      return;
    }

    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[webSemanticGuard] Exception: ${msg}`);
    next();
  }
}

/**
 * 3. webAnomalyDetector: Отслеживание аномалий и подозрительных всплесков трафика.
 */
export function webAnomalyDetector(req: Request, res: Response, next: NextFunction): void {
  try {
    const clientId = resolveClientId(req);
    const tracking = AnomalyDetector.trackRequest(clientId);

    if (tracking.isSuspicious) {
      logger.warn(`🚨 [webAnomalyDetector] Suspicious activity detected for client ${clientId}: ${tracking.reason}`);
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Превышен порог активности. Пожалуйста, подождите минуту перед повторным запросом.'
      });
      return;
    }

    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[webAnomalyDetector] Exception: ${msg}`);
    next();
  }
}
