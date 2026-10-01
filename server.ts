import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Поиск .env файла в нескольких возможных местах для максимальной совместимости
const possiblePaths = [
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", ".env"),
  path.join(process.env.HOME || "/home/ubuntu", ".env")
];

let envPath = possiblePaths[0];
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    envPath = p;
    break;
  }
}

dotenv.config({ path: envPath, override: true });

console.log(`📂 [ENV DIAGNOSTICS] Resolved .env path: ${envPath}`);
console.log(`📂 [ENV DIAGNOSTICS] File exists: ${fs.existsSync(envPath)}`);
console.log(`📂 [ENV DIAGNOSTICS] MAX_BOT_TOKEN is loaded: ${!!process.env.MAX_BOT_TOKEN} (length: ${process.env.MAX_BOT_TOKEN ? process.env.MAX_BOT_TOKEN.length : 0})`);

import express from "express";
import cors from "cors";

// 0. Global Process Error Handlers - Log full stack and keep process alive
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  const stack = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
  console.error(`🚨 [UnhandledRejection] Process kept alive. Stack:\n${stack}`);
});

process.on('uncaughtException', (error: Error, origin: string) => {
  const stack = error?.stack || String(error);
  console.error(`🚨 [UncaughtException] Origin: ${origin}. Process kept alive. Stack:\n${stack}`);
});

import { createServer as createViteServer } from "vite";
import { sqliteDb } from "./db";
import { apiRateLimiter, expensiveOpLimiter, adminLoginLimiter } from "./middleware/rateLimit";
import { authMiddleware } from "./middleware/auth";
import { webModelArmor, webSemanticGuard, webAnomalyDetector } from "./src/web/middleware/security";
import { logger } from "./src/logger";
import { metrics } from "./src/metrics";
import { getPrometheusMetrics, getPrometheusContentType } from "./src/metrics/prometheus";
import { requestIdMiddleware } from "./src/middleware/requestId";
import { aiShieldMiddleware } from "./src/middleware/ai-shield";
import { filterAIOutput } from "./src/services/security/output-filter";
import { trackUserRateAndAnomalies } from "./src/services/ai/agent-monitor";
import { llmService } from "./src/core/LLMService";
import { SelinCore } from "./src/core/SelinCore";
import { MaxAdapter as ModernMaxAdapter } from "./src/adapters/MaxAdapter";
import { TelegramAdapter } from "./src/adapters/TelegramAdapter";
import { agentOrchestrator } from "./src/core/AgentOrchestrator";
import { checkRequiredEnvVars } from "./src/config/env";
import { initSessionsDb, closeDatabase } from "./src/index";
import "./src/auto-max-poller";
import { setPollerWebhookHandler } from "./src/auto-max-poller";

// Import Modular Routers
import languageRouter from "./src/routes/language.routes";
import securityRouter from "./src/routes/security.routes";
import { fintechRouter } from "./src/fintech/routes";
import yookassaWebhookRouter from "./src/routes/yookassa.webhook";
import voiceRouter from "./src/routes/voice.routes";
import adminRouter from "./src/routes/admin.routes";
import { VPNService } from "./src/services/network/VPNService";
import { nativeVLESSEngine } from "./src/services/network/NativeVLESSEngine";
import aiRouter from "./src/routes/ai.routes";
import mcpRouter from "./src/routes/mcp.routes";
import legalRouter from "./src/routes/legal.routes";
import plannerRouter from "./src/routes/planner.routes";
import ragRouter from "./src/routes/rag.routes";
import bibleRouter from "./src/routes/bible.routes";
import crmRouter from "./src/routes/crm.routes";
import { healthRouter } from "./src/routes/health";
import { adminGuard, adminLoginHandler } from "./src/middleware/adminAuth";

// Re-exports for voice normalizer, text utilities, and bible service
export {
  numberToWords,
  cardinal,
  ordinalM,
  ordinalF,
  ordinalGenM,
  ordinalPrepM,
  yearToSpeech,
  числительное,
  normalizeBiblicalReferences,
  normalizeYears,
  normalizeTimeOfDay,
  normalizeHours12
} from "./src/utils/voiceNormalizer";
export { cleanForMax, prepareVoiceText, normalizeForVoice, splitTextSmart } from "./src/utils/textUtils";
export { handleBibleSubscription } from "./src/services/bible/bibleCommands";
export {
  startBibleScheduler,
  checkAndSendBibleBroadcast,
  BIBLE_SLOTS,
  getDaysPassed,
  getDayIndex,
  getPlanDaySummary,
  getPlanContentsSummary,
  skipUserPlanDays,
  getUserPlanDay,
  isPlanFileExisting
} from "./src/services/bible/bibleService";
export {
  handleCallback,
  handleCityInput,
  renderBriefingMenu,
  renderPlanMenu,
  geocodeCityWithNominatim,
  isWaitingForCity,
  setWaitingForCity
} from "./src/services/CallbackRouter";
import { startBibleScheduler } from "./src/services/bible/bibleService";
import { startMorningScheduler } from "./src/services/planning/morningBriefing";
import { SecurityGateway } from "./src/core/SecurityGateway";
import helmet from "helmet";

process.env.IMAGE_EDIT = "0";
process.env.STRESS_FIX = "0";
checkRequiredEnvVars();

export const app = express();
export const PORT = 3000;

app.set("trust proxy", 1);

// Security Headers (Helmet) с поддержкой iframe превью и внешних каналов
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

// 1. Request ID and Metrics Tracking Middleware
app.use(requestIdMiddleware);
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const tenantId = (req as any).user?.tenant_id || (req as any).user?.chatId || (req as any).tenant_id || "default";
    const routePath = req.route ? req.route.path : req.path;

    logger.info(SecurityGateway.maskPII(`HTTP ${req.method} ${req.path} ${res.statusCode}`), {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      tenantId,
      requestId: (req as any).requestId,
    });

    metrics.incrementCounter("http_requests_total", {
      method: req.method,
      path: routePath,
      status: String(res.statusCode),
      tenant_id: tenantId,
    });

    metrics.observeHistogram("http_request_duration_seconds", durationMs / 1000, {
      method: req.method,
      path: routePath,
    });

    metrics.recordTenantActivity(tenantId);
  });
  next();
});

// 2. Global Parsers
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 3. Selin AI Core Services Initialization
export const selinLLMService = llmService;
export const selinCore = new SelinCore(selinLLMService);
export const modernMaxAdapter = new ModernMaxAdapter(selinCore, process.env.MAX_BOT_TOKEN);
modernMaxAdapter.connect().catch((err) => logger.error("Failed to connect modernMaxAdapter", { error: err }));

// Connect Long Polling handler directly to modernMaxAdapter
setPollerWebhookHandler(async (updateBody) => {
  const mockReq = { body: updateBody };
  const mockRes = {
    headersSent: false,
    status: () => mockRes,
    send: () => {},
    json: () => {}
  };
  await modernMaxAdapter.handleWebhook(mockReq, mockRes);
});

export const telegramAdapter = new TelegramAdapter(agentOrchestrator);
telegramAdapter.registerWebhook().catch((err) => logger.error("Failed to register Telegram webhook", { error: err }));

// 4. MAX Messenger Webhook Endpoints
app.post(["/api/max/webhook", "/max/webhook"], async (req, res) => {
  try {
    await modernMaxAdapter.handleWebhook(req, res);
  } catch (error: any) {
    logger.error("❌ MaxAdapter webhook error:", error);
    return res.status(200).send("ok");
  }
});

app.get(["/api/max/webhook", "/max/webhook"], (req, res) => {
  logger.info("MAX webhook GET verification received");
  return res.status(200).json({ ok: true });
});

// Telegram Webhook
app.post('/api/telegram/webhook', async (req, res) => {
  try { await telegramAdapter.handleWebhook(req, res); }
  catch (err: any) { logger.error('Telegram Webhook error:', err); return res.status(200).json({ ok: false }); }
});

// 5. Security & Rate Limiting Middlewares for /api routes
app.use("/api", (req, res, next) => {
  if (req.originalUrl.startsWith("/api/max/webhook") || req.originalUrl.startsWith("/api/telegram") || req.originalUrl.startsWith("/api/ai/") || req.originalUrl.startsWith("/api/yookassa") || req.originalUrl.startsWith("/api/robokassa") || req.originalUrl.startsWith("/api/payments")) return next();
  return aiShieldMiddleware(req, res, next);
});

app.use("/api", (req, res, next) => {
  if (req.originalUrl.startsWith("/api/max/webhook") || req.originalUrl.startsWith("/api/telegram") || req.originalUrl.startsWith("/api/ai/") || req.originalUrl.startsWith("/api/yookassa") || req.originalUrl.startsWith("/api/robokassa") || req.originalUrl.startsWith("/api/payments")) return next();
  return apiRateLimiter(req, res, next);
});

app.use(["/api/tts", "/api/synthesize", "/api/voice-organism-dialogue"], (req, res, next) => {
  if (req.originalUrl.startsWith("/api/max/webhook") || req.originalUrl.startsWith("/api/telegram") || req.originalUrl.startsWith("/api/ai/")) return next();
  return expensiveOpLimiter(req, res, next);
});

app.use("/api", (req, res, next) => {
  if (req.originalUrl.startsWith("/api/max/webhook") || req.originalUrl.startsWith("/api/telegram") || req.originalUrl.startsWith("/api/ai/") || req.originalUrl.startsWith("/api/yookassa") || req.originalUrl.startsWith("/api/robokassa") || req.originalUrl.startsWith("/api/payments")) return next();
  const tenantId = (req as any).user?.tenant_id || (req as any).user?.chatId || "default";
  trackUserRateAndAnomalies(tenantId);
  next();
});

// Output Sanitization Filter
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/max/webhook") || req.originalUrl.startsWith("/api/telegram") || req.originalUrl.startsWith("/api/ai/") || req.originalUrl.startsWith("/api/yookassa") || req.originalUrl.startsWith("/api/robokassa") || req.originalUrl.startsWith("/api/payments")) return next();
  const originalJson = res.json;
  const originalSend = res.send;
  const tenantId = (req as any).user?.tenant_id || (req as any).user?.chatId || "default";
  const userPrompt = req.body?.user_message || req.body?.prompt || req.body?.text || "";
  let isJsonCalled = false;

  res.json = function (body: any) {
    isJsonCalled = true;
    if (body && typeof body === "object") {
      if (typeof body.text === "string") {
        body.text = filterAIOutput(body.text, { tenantId, userPrompt });
      }
      if (typeof body.response === "string") {
        body.response = filterAIOutput(body.response, { tenantId, userPrompt });
      }
      if (typeof body.message === "string" && !body.error) {
        body.message = filterAIOutput(body.message, { tenantId, userPrompt });
      }
    }
    return originalJson.call(this, body);
  };

  res.send = function (body: any) {
    if (!isJsonCalled && typeof body === "string") {
      const contentType = res.get("Content-Type");
      if (!contentType || !contentType.includes("application/json")) {
        body = filterAIOutput(body, { tenantId, userPrompt });
      }
    }
    return originalSend.call(this, body);
  };

  next();
});

// 6. Mount Modular API Routers & Web Security Layer
app.use("/api", (req, res, next) => {
  // Исключаем вебхуки мессенджеров и платежей из веб-защиты
  if (
    req.originalUrl.startsWith("/api/max/webhook") ||
    req.originalUrl.startsWith("/api/telegram") ||
    req.originalUrl.startsWith("/api/yookassa") ||
    req.originalUrl.startsWith("/api/robokassa")
  ) {
    return next();
  }
  return webAnomalyDetector(req, res, next);
});

app.use("/api", (req, res, next) => {
  if (
    req.originalUrl.startsWith("/api/max/webhook") ||
    req.originalUrl.startsWith("/api/telegram") ||
    req.originalUrl.startsWith("/api/yookassa") ||
    req.originalUrl.startsWith("/api/robokassa")
  ) {
    return next();
  }
  return webModelArmor(req, res, next);
});

app.use("/api", (req, res, next) => {
  if (
    req.originalUrl.startsWith("/api/max/webhook") ||
    req.originalUrl.startsWith("/api/telegram") ||
    req.originalUrl.startsWith("/api/yookassa") ||
    req.originalUrl.startsWith("/api/robokassa")
  ) {
    return next();
  }
  return webSemanticGuard(req, res, next);
});

app.post("/api/admin/login", adminLoginLimiter, adminLoginHandler);

app.use((req, res, next) => {
  const url = req.originalUrl;
  
  // Skip logic: if /api/admin/login or /api/admin/status, proceed without adminGuard
  if (
    url === "/api/admin/login" || 
    url.startsWith("/api/admin/login?") || 
    url === "/api/admin/status" || 
    url.startsWith("/api/admin/status?") ||
    url.startsWith("/api/admin/vpn-")
  ) {
    return next();
  }

  // Apply adminGuard for specified endpoints
  if (
    url.startsWith("/api/admin") ||
    url.startsWith("/api/moderation") ||
    url.startsWith("/api/knowledge") ||
    url.startsWith("/api/security")
  ) {
    return adminGuard(req, res, next);
  }

  next();
});

app.use(fintechRouter);
app.use(yookassaWebhookRouter);
app.use("/api", (req, res, next) => {
  if (
    req.originalUrl.startsWith("/api/max/webhook") || 
    req.originalUrl.startsWith("/api/ai/") || 
    req.originalUrl.startsWith("/api/yookassa") || 
    req.originalUrl.startsWith("/api/robokassa") || 
    req.originalUrl.startsWith("/api/payments") || 
    req.originalUrl.startsWith("/api/health") ||
    req.originalUrl.startsWith("/api/bible") ||
    req.originalUrl.startsWith("/api/rag") ||
    req.originalUrl.startsWith("/api/orchestrator") ||
    req.originalUrl.startsWith("/api/admin") ||
    req.originalUrl.startsWith("/api/planner")
  ) return next();
  return authMiddleware(req, res, next);
});

app.use("/api/security", securityRouter);
app.use("/api/language", languageRouter);
app.use("/api", voiceRouter);
app.use("/api", adminRouter);
app.use("/api", aiRouter);
app.use("/api", mcpRouter);
app.use("/api/planner", plannerRouter);
app.use("/api/rag", ragRouter);
app.use("/api/bible", bibleRouter);
app.use("/api/crm", crmRouter);
app.use("/api", healthRouter);
app.use(legalRouter);

// Global Error Handler - Masking internal error stack traces to clients
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error(`🚨 [GlobalErrorHandler] Unhandled error on ${req.method} ${req.originalUrl}: ${msg}`, { stack });

  if (res.headersSent) {
    return;
  }

  const statusCode = (err as { status?: number; statusCode?: number }).statusCode || (err as { status?: number }).status || 500;
  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal Server Error" : "Request Processing Error",
    message: statusCode >= 500 ? "Произошла внутренняя ошибка сервера. Пожалуйста, повторите запрос позже." : msg
  });
});

// Prometheus / OpenMetrics endpoint
app.get("/metrics", async (_, res) => {
  try {
    res.setHeader("Content-Type", getPrometheusContentType());
    res.send(await getPrometheusMetrics());
  } catch (err: any) {
    logger.error("❌ [Metrics] Error serving metrics:", err);
    res.status(500).send("Error serving metrics");
  }
});

// 7. Server Boot and Lifecycle
async function startServer() {
  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const serverInstance = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`🚀 SELIN Enterprise AI Core running on port ${PORT} (Cloud Run HTTP/2 Ingress Ready)`);
    nativeVLESSEngine.attach(serverInstance, "/selin-ws");
  });

  serverInstance.on("error", (err: unknown) => {
    const msg = err instanceof Error ? (err.stack || err.message) : String(err);
    logger.error(`🚨 [Server Network Error] serverInstance emitted error: ${msg}`);
  });

  // Background Database & Service Initialization (Non-blocking)
  try {
    await initSessionsDb();
    logger.info("📁 Sessions Database initialized successfully using sqlite3 (async/await)");

    try {
      const { restoreFromRedis } = await import("./src/fintech/restore");
      await restoreFromRedis();
    } catch (restErr) {
      logger.error("❌ Error running restoreFromRedis:", restErr);
    }

    // === ЧАСТЬ А: АВАРИЙНАЯ АКТИВАЦИЯ КЛИЕНТА (одноразовая миграция) ===
    try {
      const { getSubscription, activateSubscription } = await import("./src/fintech/subscriptions");
      const clientChatId = '27490572';
      const existingSub = getSubscription(clientChatId);
      if (!existingSub || !existingSub.paid_until || new Date(existingSub.paid_until).getTime() <= Date.now()) {
        activateSubscription(clientChatId, 'month', 30);
        console.log(`🚑 [Fix] emergency activation: ${clientChatId} month`);
        logger.info(`🚑 [Fix] emergency activation: ${clientChatId} month`);
      }

      const { ensureNewUserPlanProfile } = await import("./src/services/ai/ProfileService");
      ensureNewUserPlanProfile(clientChatId);
      console.log(`🕊 [Fix] Auto-enabled Victory Plan for client ${clientChatId}`);
      logger.info(`🕊 [Fix] Auto-enabled Victory Plan for client ${clientChatId}`);
    } catch (emErr) {
      logger.error("❌ Error running emergency activation:", emErr);
    }
  } catch (err) {
    logger.error("❌ Error initializing sessions database:", { error: err });
  }

  // Background schedulers
  startBibleScheduler(
    async (chatId, text) => {
      await modernMaxAdapter.sendMessage(chatId, text);
    },
    async (chatId, text) => {
      await modernMaxAdapter.sendVoice(chatId, text);
    }
  );
  startMorningScheduler(
    async (chatId, text, extra) => {
      await modernMaxAdapter.safeSendMessageToChat(chatId, text, extra);
    },
    async (chatId, text) => {
      await modernMaxAdapter.sendVoice(chatId, text);
    }
  );

  // Start Subscription Reminder Scheduler
  import("./src/fintech/subscriptions").then(({ startSubscriptionReminderScheduler }) => {
    startSubscriptionReminderScheduler(async (chatId, text, extra) => {
      await modernMaxAdapter.safeSendMessageToChat(chatId, text, extra);
    });
  }).catch((err) => {
    logger.error("❌ Error initializing subscription reminder scheduler:", err);
  });

  // Start Reminder Scheduler
  setInterval(async () => {
    try {
      const { checkAndSendReminders } = await import("./src/services/planning/ReminderService");
      await checkAndSendReminders(async (chatId, text) => {
        await modernMaxAdapter.sendMessage(chatId, text);
      });
    } catch (err) {
      logger.error("❌ Error running checkAndSendReminders:", err);
    }
  }, 20000);

  // Run Voice Synthesis Self-Test & Start Hook Pre-generation
  (async () => {
    try {
      const { synthesizeForChat } = await import("./src/services/voice/TTSService");
      logger.info("🧪 [Voice Self-Test] Initiating voice synthesis self-test...");
      const testChatId = "test_self_check_chat";
      const testText = "Здравствуйте, я Селин, ваш помощник";
      const audioBuffer = await synthesizeForChat(testChatId, testText);
      if (audioBuffer) {
        logger.info(`🧪 [Voice Self-Test] Successfully synthesized "${testText}" for chat ${testChatId}. Buffer size: ${audioBuffer.length} bytes.`);
      } else {
        logger.error(`❌ [Voice Self-Test] Voice self-test returned null Buffer.`);
      }
    } catch (err: any) {
      logger.error(`❌ [Voice Self-Test] Voice self-test failed: ${err.message || err}`);
    }

    // Pre-generate Start Voice Hook (asynchronously, non-blocking)
    try {
      const { pregenerateStartHook } = await import("./src/services/voice/StartHookService");
      await pregenerateStartHook(true);
    } catch (err: any) {
      logger.warn(`⚠️ [StartHook] Server startup pre-generation error: ${err?.message || err}`);
    }

    // Run Image Generation Self-Test (asynchronously)
    try {
      const { runImageGenSelfTest } = await import("./src/adapters/MaxAdapter");
      await runImageGenSelfTest();
    } catch (err: any) {
      logger.error(`❌ [ImageGen Self-Test] Startup check failed: ${err?.message || err}`);
    }

    // Start LegalScout Scheduler
    try {
      const { startLegalScoutScheduler } = await import("./src/agents/LegalScout");
      startLegalScoutScheduler();
      logger.info("✅ [LegalScout] Scheduler started successfully.");
    } catch (err: any) {
      logger.error("❌ Failed to start LegalScout Scheduler:", err);
    }
  })();

  function gracefulShutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    serverInstance.close(async () => {
      logger.info("HTTP server closed.");
      if (sqliteDb) {
        try {
          sqliteDb.close();
          logger.info("Main SQLite database connection closed gracefully.");
        } catch (err) {
          logger.error("Error closing main SQLite connection", { error: err });
        }
      }
      try {
        await closeDatabase();
        logger.info("Sessions SQLite database connection closed gracefully.");
      } catch (err) {
        logger.error("Error closing sessions database:", { error: err });
      }
      try {
        const { redisService } = await import("./src/services/RedisService");
        await redisService.disconnect();
        logger.info("Redis connection closed gracefully.");
      } catch (err) {
        logger.error("Error closing Redis connection gracefully:", { error: err });
      }
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forceful shutdown after 10s timeout");
      process.exit(1);
    }, 10000).unref();
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack || err.message) : String(err);
  console.error(`🚨 [Server Boot Failure] startServer failed: ${msg}`);
});
