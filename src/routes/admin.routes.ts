import { Router } from "express";
import * as pdf from "pdf-parse";
import mammoth from "mammoth";
import { exec } from "child_process";
import { promisify } from "util";
import { sqliteDb } from "../../db";
import { SSHService } from "../services/SSHService";

const execAsync = promisify(exec);
import {
  getCompanyConfig,
  saveCompanyConfig,
  getModerationQueue,
  saveModerationQueue,
  getModerationLog,
  saveModerationLog,
  getKnowledgeBase,
  saveKnowledgeBase,
  getTelegramChats,
  saveTelegramChats,
  cachedFeed,
  logFeedEvent
} from "../services/adminService";
import { logger } from "../logger";

const adminRouter = Router();

// 1. Sync Status
adminRouter.get("/sync-status", (req, res) => {
  return res.json({
    status: "synced",
    sqlite: true,
    lastSync: new Date().toISOString()
  });
});

// 2. Company Config GET / POST
adminRouter.get(["/get-config", "/admin/config"], (req, res) => {
  return res.json({ config: getCompanyConfig() });
});

adminRouter.post(["/save-config", "/admin/config"], (req, res) => {
  const config = req.body;
  if (!config || typeof config !== "object") {
    return res.status(400).json({ error: "Invalid configuration object." });
  }
  saveCompanyConfig(config);
  logFeedEvent("operator", "setup", "Настройки обновлены", config.business_name || "", "info");
  return res.json({ success: true, config });
});

// 3. Admin System Status
adminRouter.get("/admin/status", (req, res) => {
  const kb = getKnowledgeBase();
  const queue = getModerationQueue();
  const config = getCompanyConfig();
  return res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    knowledge_base: {
      documentCount: kb.documents.length,
      chunkCount: kb.chunks.length
    },
    moderation: {
      pendingCount: queue.length
    },
    feed_count: cachedFeed.length,
    config: {
      business_name: config.business_name,
      industry: config.industry,
      is_live: config.is_live,
      channels: config.channels
    }
  });
});

// 4. Admin Metrics
adminRouter.get("/admin/metrics", (req, res) => {
  return res.json({
    feedCount: cachedFeed.length,
    knowledgeDocuments: getKnowledgeBase().documents.length,
    moderationPending: getModerationQueue().length,
    uptimeSeconds: process.uptime()
  });
});

// 5. Admin Feed
adminRouter.get(["/feed", "/admin/feed"], (req, res) => {
  return res.json({ feed: cachedFeed });
});

// 6. Admin Moderation
adminRouter.get(["/moderation/queue", "/moderation/pending", "/admin/moderation"], (req, res) => {
  return res.json({ queue: getModerationQueue(), log: getModerationLog() });
});

adminRouter.post("/moderation/action", (req, res) => {
  const { id, action, editedResponse } = req.body;
  const queue = getModerationQueue();
  const itemIndex = queue.findIndex(i => i.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: "Item not found in moderation queue" });
  }

  const item = queue[itemIndex];
  queue.splice(itemIndex, 1);
  saveModerationQueue(queue);

  const logEntry = {
    ...item,
    resolvedAt: new Date().toISOString(),
    resolution: action,
    finalResponse: action === "edit" ? editedResponse : item.proposedResponse
  };
  saveModerationLog(logEntry);
  logFeedEvent("operator", "moderation", `Сообщение ${action === "approve" ? "одобрено" : "отклонено"}`, item.userMessage?.slice(0, 50), "success");

  return res.json({ success: true, item: logEntry });
});

// 7. Admin Chats
adminRouter.get("/admin/chats", (req, res) => {
  try {
    let chats: any[] = [];
    if (sqliteDb) {
      chats = sqliteDb.prepare("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 50").all();
    }
    return res.json({ chats });
  } catch (e: any) {
    return res.json({ chats: getTelegramChats() });
  }
});

// 8. Knowledge Base (RAG)
adminRouter.get(["/knowledge/status", "/admin/knowledge"], (req, res) => {
  const kb = getKnowledgeBase();
  return res.json({
    documentCount: kb.documents.length,
    chunkCount: kb.chunks.length,
    documents: kb.documents
  });
});

adminRouter.post("/knowledge/upload", async (req, res) => {
  try {
    const { name, type, base64, textContent } = req.body;
    let extractedText = "";

    if (textContent) {
      extractedText = textContent;
    } else if (base64) {
      const buffer = Buffer.from(base64, "base64");
      if (type === "application/pdf") {
        const pdfParser = ((pdf as any).default || pdf) as any;
        const parsed = await pdfParser(buffer);
        extractedText = parsed.text;
      } else if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || (name && name.endsWith(".docx"))) {
        const parsed = await mammoth.extractRawText({ buffer });
        extractedText = parsed.value;
      } else {
        extractedText = buffer.toString("utf-8");
      }
    } else {
      return res.status(400).json({ error: "Neither textContent nor base64 was provided." });
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: "Extracted document content is empty." });
    }

    const docId = `doc_${Date.now()}`;
    const kb = getKnowledgeBase();

    const newDoc = {
      id: docId,
      name: name || "Ручной текст",
      type: textContent ? "text" : "file",
      size: textContent ? Buffer.byteLength(textContent) : Buffer.byteLength(base64, "base64"),
      uploadedAt: new Date().toLocaleString("ru-RU"),
      chunkCount: 1
    };

    kb.documents.push(newDoc);
    kb.chunks.push({
      id: `${docId}_c0`,
      docId,
      docName: newDoc.name,
      text: extractedText.trim()
    });
    saveKnowledgeBase(kb);

    logFeedEvent("knowledge", "upload", "База знаний пополнена", newDoc.name, "success");
    return res.json({ success: true, document: newDoc });
  } catch (error: any) {
    logger.error("Knowledge upload error:", { error: error?.message || error });
    return res.status(500).json({ error: error?.message || "Failed to parse document" });
  }
});

adminRouter.post("/knowledge/delete", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Document ID is required." });

  const kb = getKnowledgeBase();
  const prevDocCount = kb.documents.length;
  kb.documents = kb.documents.filter(d => d.id !== id);
  kb.chunks = kb.chunks.filter(c => c.docId !== id);

  if (kb.documents.length === prevDocCount) {
    return res.status(404).json({ error: "Document not found." });
  }

  saveKnowledgeBase(kb);
  logFeedEvent("knowledge", "delete", "Документ удалён из базы", id, "warning");
  return res.json({ success: true, remainingDocuments: kb.documents.length });
});

// 9. Chats integration
adminRouter.get(["/max/chats", "/telegram/chats"], (req, res) => {
  return res.json({ chats: getTelegramChats() });
});

adminRouter.post(["/max/send-message", "/telegram/send-message"], async (req, res) => {
  const { chatId, text } = req.body;
  if (!chatId || !text) return res.status(400).json({ error: "chatId and text are required" });

  const chats = getTelegramChats();
  const chatIndex = chats.findIndex(c => c.id === chatId);
  if (chatIndex !== -1) {
    chats[chatIndex].history.push({ sender: "agent", text });
    chats[chatIndex].lastMessage = text;
    chats[chatIndex].timestamp = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    saveTelegramChats(chats);
  }

  return res.json({ success: true });
});

// 10. Admin Terminal (System Commands)
adminRouter.post("/admin/terminal", async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "Command is required" });

  // Список разрешенных безопасных команд или их префиксов
  const allowedCommands = [
    'ls', 'pwd', 'uptime', 'free', 'df', 'docker ps', 'docker stats', 
    'ollama list', 'git status', 'uname', 'date', 'ps aux | grep selin',
    'tail -n 50 logs/app.log', 'tail -n 50 logs/error.log',
    'cd /services/selin-ai && sudo git pull',
    'sudo git pull',
    'sudo docker compose'
  ];

  const isAllowed = allowedCommands.some(c => command.startsWith(c));
  
  // Дополнительная проверка на опасные символы (блокируем ; , < , > , $ , | )
  // Разрешаем && для цепочек и | для grep
  const isDangerous = /[;><$]/.test(command) || (command.includes('|') && !command.includes('grep'));
  
  if (!isAllowed && isDangerous) {
    logger.warn(`🛑 [Terminal] Blocked dangerous/unsupported command: ${command}`);
    return res.status(403).json({ error: "Command not allowed for safety reasons" });
  }

  try {
    logger.info(`📟 [Terminal] Executing command: ${command}`);
    
    // Если настроен удаленный SSH-доступ, выполняем там. Если нет - локально.
    if (SSHService.isConfigured()) {
      const result = await SSHService.executeRemote(command);
      return res.json({
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        timestamp: new Date().toISOString(),
        remote: true
      });
    }

    const { stdout, stderr } = await execAsync(command, { timeout: 300000 });
    return res.json({
      stdout: stdout || "",
      stderr: stderr || "",
      timestamp: new Date().toISOString(),
      remote: false
    });
  } catch (error: any) {
    return res.json({
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || "Unknown error",
      code: error.code,
      timestamp: new Date().toISOString()
    });
  }
});

export default adminRouter;
