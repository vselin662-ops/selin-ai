import { Router } from "express";
import * as pdf from "pdf-parse";
import mammoth from "mammoth";
import { exec } from "child_process";
import { promisify } from "util";
import { sqliteDb } from "../../db";
import { SSHService } from "../services/SSHService";
import { SecurityAuditService } from "../services/SecurityAuditService";
import { VPNService } from "../services/network/VPNService";
import { selinTunnelEngine } from "../services/network/SelinTunnelEngine";

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

// 0. VPN Control (Moved to top for priority)
adminRouter.get("/admin/vpn-status", (req, res) => {
  try {
    const vpn = VPNService.getInstance();
    return res.json(vpn.getStatus());
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

adminRouter.post("/admin/vpn-toggle", async (req, res) => {
  const { active, port } = req.body;
  const vpn = VPNService.getInstance();
  const status = vpn.getStatus();

  try {
    if (active && !status.active) {
      await vpn.start(port || 1080);
      logFeedEvent("security", "vpn", "VPN Туннель запущен", `Порт: ${port || 1080}`, "success");
    } else if (!active && status.active) {
      vpn.stop();
      logFeedEvent("security", "vpn", "VPN Туннель остановлен", "", "warning");
    }
    return res.json({ success: true, status: vpn.getStatus() });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

adminRouter.get("/admin/vpn-clients", (req, res) => {
  if (!sqliteDb) return res.status(500).json({ error: "DB not initialized" });
  try {
    const clients = sqliteDb.prepare("SELECT * FROM vpn_clients ORDER BY created_at DESC").all();
    return res.json({ clients: clients || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

adminRouter.post("/admin/vpn-clients", (req, res) => {
  const { client_name, plan, expires_at } = req.body;
  if (!client_name) return res.status(400).json({ error: "client_name is required" });

  const id = `vpn_${Date.now()}`;
  const username = `selin_${Math.random().toString(36).substring(2, 7)}`;
  const password = Math.random().toString(36).substring(2, 10);
  const now = new Date().toISOString();

  try {
    sqliteDb.prepare(`
      INSERT INTO vpn_clients (id, client_name, username, password, plan, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, client_name, username, password, plan || 'standard', 'active', expires_at || null, now);

    logFeedEvent("security", "vpn", "Новый клиент VPN", client_name, "success");
    return res.json({ success: true, client: { id, client_name, username, password } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

adminRouter.post("/admin/vpn-clients-delete", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    sqliteDb.prepare("DELETE FROM vpn_clients WHERE id = ?").run(id);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// SEST (Selin Encrypted Stream Tunnel) Production Endpoints
adminRouter.get("/admin/tunnel-stats", (req, res) => {
  try {
    return res.json(selinTunnelEngine.getStats());
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

adminRouter.post("/tunnel/handshake", (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });

  const auth = selinTunnelEngine.authenticateClient(username, password);
  if (!auth.success) {
    return res.status(401).json({ error: auth.error || "Authentication failed" });
  }

  const sessionId = selinTunnelEngine.registerSession(auth.clientId!, username, auth.plan!);
  return res.json({
    success: true,
    sessionId,
    protocol: "SEST-v2-HTTPS-Multiplex",
    message: "Encrypted stream tunnel handshake successful"
  });
});

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
adminRouter.get("/admin/terminal/status", (req, res) => {
  return res.json({
    configured: SSHService.isConfigured(),
    host: '176.108.252.111',
    user: 'ubuntu'
  });
});

adminRouter.post("/admin/terminal", async (req, res) => {
  const { command } = req.body;
  const user = (req as any).user;
  const chatId = user?.chatId || user?.sub || 'unknown';
  const ip = req.ip || req.socket.remoteAddress;

  if (!command) return res.status(400).json({ error: "Command is required" });

  // Список разрешенных безопасных команд или их префиксов
  const allowedCommands = [
    'ls', 'pwd', 'uptime', 'free', 'df', 'docker ps', 'docker stats', 
    'ollama list', 'git status', 'uname', 'date', 'ps aux | grep selin',
    'tail -n 50 logs/app.log', 'tail -n 50 logs/error.log',
    'cd /services/selin-ai && sudo git pull',
    'sudo git pull',
    'sudo docker compose',
    'curl', 'ping -c 4', 'nslookup', 'wget'
  ];

  const isAllowed = allowedCommands.some(c => command.startsWith(c));
  
  // Дополнительная проверка на опасные символы (блокируем ; , < , > , $ , | )
  const isDangerous = /[;><$]/.test(command) || (command.includes('|') && !command.includes('grep'));
  
  if (!isAllowed && isDangerous) {
    await SecurityAuditService.logEvent({
      chatId,
      action: 'TERMINAL_COMMAND_BLOCKED',
      command,
      ip,
      status: 'blocked',
      details: 'Attempted dangerous or unsupported command'
    });
    logger.warn(`🛑 [Terminal] Blocked dangerous/unsupported command: ${command}`);
    return res.status(403).json({ error: "Command not allowed for safety reasons" });
  }

  try {
    logger.info(`📟 [Terminal] Executing command: ${command}`);
    
    await SecurityAuditService.logEvent({
      chatId,
      action: 'TERMINAL_COMMAND_EXECUTE',
      command,
      ip,
      status: 'success'
    });

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

// 11. VPN Control
// (Moved to top)

// 12. VPN Commercial Client Management
// (Moved to top)

export default adminRouter;
