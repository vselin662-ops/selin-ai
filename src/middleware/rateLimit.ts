// src/middleware/rateLimit.ts
import rateLimit from "express-rate-limit";
import { metrics } from "../metrics";

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return req.ip || (req.headers["x-forwarded-for"] as string) || "127.0.0.1";
  },
  handler: (req, res, next, options) => {
    metrics.incrementCounter("rate_limit_hits_total", { limiter: "apiRateLimiter" });
    res.status(options.statusCode).json(options.message);
  },
  message: {
    error: "Too many requests, please try again after 15 minutes."
  }
});

export const expensiveOpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return req.ip || (req.headers["x-forwarded-for"] as string) || "127.0.0.1";
  },
  handler: (req, res, next, options) => {
    metrics.incrementCounter("rate_limit_hits_total", { limiter: "expensiveOpLimiter" });
    res.status(options.statusCode).json(options.message);
  },
  message: {
    error: "Too many expensive operations, please try again after a minute."
  }
});

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return req.ip || (req.headers["x-forwarded-for"] as string) || "127.0.0.1";
  },
  handler: (req, res, next, options) => {
    metrics.incrementCounter("rate_limit_hits_total", { limiter: "webhookLimiter" });
    res.status(options.statusCode).json(options.message);
  },
  message: {
    error: "Webhook rate limit exceeded."
  }
});

/**
 * Ограничение на вход в панель администратора: максимум 3 попытки в минуту
 */
export const adminLoginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return req.ip || (req.headers["x-forwarded-for"] as string) || "127.0.0.1";
  },
  handler: (req, res, next, options) => {
    metrics.incrementCounter("rate_limit_hits_total", { limiter: "adminLoginLimiter" });
    res.status(options.statusCode).json(options.message);
  },
  message: {
    error: "Too Many Login Attempts",
    message: "Превышено максимальное число попыток входа (3 в минуту). Пожалуйста, подождите."
  }
});

// Alias for Webhook rate limiters
export const Webhook = webhookLimiter;
export const webhook = webhookLimiter;
