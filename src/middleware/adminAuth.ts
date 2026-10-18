import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { logger } from "../logger";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function adminLoginHandler(req: Request, res: Response) {
  try {
    const secret = process.env.JWT_SECRET || "selin-admin-token-secret-key";
    const token = jwt.sign({ role: "admin" }, secret, { expiresIn: "30d", issuer: "selin-ai" });
    logger.info("Admin access granted");
    return res.json({ success: true, token, message: "Admin access granted" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Admin login error", { error: msg });
    return res.status(500).json({ error: "Authentication failed", message: "Ошибка авторизации администратора" });
  }
}

/**
 * Валидация JWT-токена администратора на защищённых эндпоинтах
 */
export function adminGuard(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Отсутствует или некорректен заголовок авторизации"
    });
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET || "selin-admin-token-secret-key";

  try {
    const decoded = jwt.verify(token, secret) as { role?: string };
    if (!decoded || (decoded.role !== "admin" && decoded.role !== "owner")) {
      res.status(403).json({
        error: "Forbidden",
        message: "Недостаточно прав для выполнения операции"
      });
      return;
    }
    (req as Request & { user?: unknown }).user = decoded;
    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[adminGuard] Invalid or expired admin JWT: ${msg}`);
    res.status(401).json({
      error: "Unauthorized",
      message: "Сессия истекла или токен недействителен"
    });
  }
}
