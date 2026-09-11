import { Router } from "express";
import { llmService } from "../core/LLMService";
import { AgentOrchestrator } from "../core/AgentOrchestrator";
import { MessageContext, ChannelType } from "../core/types";
import { logger } from "../logger";
import { agentQueueService } from "../services/agentQueueService";

const aiRouter = Router();
const orchestrator = new AgentOrchestrator(llmService);

// 1. Reset Chat Memory
aiRouter.post('/chat/reset', (req, res) => {
  const { chatId } = req.body;
  if (chatId) {
    llmService.clearMemory(chatId);
    return res.json({ success: true, message: 'Память очищена' });
  }
  return res.status(400).json({ error: 'chatId required' });
});

// 2. Chat Message Dispatcher
aiRouter.post("/chats/message", async (req, res) => {
  const { chatId, text } = req.body;
  if (!chatId || !text) {
    return res.status(400).json({ error: "chatId and text are required." });
  }

  try {
    const context: MessageContext = {
      chatId: String(chatId),
      tenantId: `web_${chatId}`,
      channel: ChannelType.WEB,
      isVoice: false,
      timestamp: Date.now()
    };

    const result = await orchestrator.processMessage(String(text), context);
    return res.json({
      response: result.text,
      confidence: result.confidence
    });
  } catch (err: any) {
    logger.error("Error in /api/chats/message:", { error: err?.message || err });
    const fallback = await llmService.smartCall(
      String(chatId),
      String(text),
      "Ты — Selin AI, интеллектуальный ассистент. Отвечай вежливо, точно и структурированно."
    );
    return res.json({ response: fallback });
  }
});

// 3. Direct Agent Respond
aiRouter.post("/agent-respond", async (req, res) => {
  const { message, agentRole } = req.body;
  try {
    const systemPrompt = `Ты — агент Selin AI (${agentRole || 'универсальный'}). Отвечай по делу, профессионально и тепло.`;
    const resp = await llmService.smartCall("temp", message || "Привет", systemPrompt);
    return res.json({ text: resp });
  } catch (error: any) {
    logger.error("Agent Respond Error:", { error: error?.message || error });
    return res.status(500).json({ error: error.message || "Failed to generate agent response" });
  }
});

// 4. Onboarding Interview
aiRouter.post("/interview", async (req, res) => {
  const { messages, forceComplete } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required." });
  }

  try {
    const prompt = messages.map((m: any) => `${m.role === 'user' ? 'Пользователь' : 'Интервьюер'}: ${m.content}`).join("\n");
    const systemPrompt = `Ты — дружелюбный русскоязычный AI-интервьюер Selin AI. Твоя задача — выяснить сферу бизнеса, потребности и каналы связи. Если все данные собраны, выведи [COMPLETE] и конфигурационный JSON.`;
    
    const resp = await llmService.generateWithFallback(
      () => [{ role: 'user', parts: [{ text: prompt }] }],
      {
        systemInstruction: systemPrompt,
        temperature: forceComplete ? 0.2 : 0.7
      }
    );

    return res.json({ text: resp.text });
  } catch (error: any) {
    logger.error("Interview Error:", { error: error?.message || error });
    return res.status(500).json({ error: error.message || "Failed to process interview" });
  }
});

// 5. Smart Plan
aiRouter.post("/smart-plan", async (req, res) => {
  const { objective, business_name, industry } = req.body;
  try {
    const prompt = `Сформируй SMART-план (5 конкретных задач) для бизнеса "${business_name || 'Бизнес'}" в сфере "${industry || 'Услуги'}" по цели: ${objective || 'Автоматизация рутины'}. Верни JSON массив объектов с полями id, title, description, priority, deadline, status.`;
    const resp = await llmService.generateWithFallback(
      () => [{ role: 'user', parts: [{ text: prompt }] }],
      {
        systemInstruction: "Ты — бизнес-аналитик и эксперт по операционному менеджменту. Возвращай валидный JSON.",
        temperature: 0.4
      }
    );

    let tasks: any[] = [];
    try {
      const cleaned = resp.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      tasks = JSON.parse(cleaned);
    } catch {
      tasks = [
        { id: "task_1", title: "Автоматизация ответов клиентам", description: "Настройка приветственных шаблонов", priority: "high", status: "pending" },
        { id: "task_2", title: "Подключение голосового ассистента", description: "Интеграция с каналами связи", priority: "medium", status: "pending" }
      ];
    }
    return res.json({ tasks });
  } catch (error: any) {
    logger.error("SMART Plan Error:", { error: error?.message || error });
    return res.status(500).json({ error: error.message || "Failed to generate SMART plan" });
  }
});

// 6. Quest Generation
aiRouter.post("/quest/generate-stations", async (req, res) => {
  const { goal, industry } = req.body;
  const stations = [
    { id: "station_1", name: "Анализ задач", desc: "Определение точек рутины" },
    { id: "station_2", name: "Конфигурация агентов", desc: "Подбор системных инструкций" },
    { id: "station_3", name: "Тестовый запуск", desc: "Проверка в реальном диалоге" }
  ];
  return res.json({ stations });
});

aiRouter.post("/quest/generate-plan", async (req, res) => {
  return res.json({
    success: true,
    plan: {
      title: "План внедрения цифрового штаба",
      steps: ["Знакомство", "Настройка", "Запуск"]
    }
  });
});

// 7. AI Status and Switching
aiRouter.get("/ai/status", (req, res) => {
  return res.json({
    activeProvider: "gemini",
    availableProviders: ["gemini", "groq"],
    models: {
      gemini: "gemini-3.5-flash",
      groq: "llama-3.3-70b-versatile"
    }
  });
});

aiRouter.post("/ai/switch", (req, res) => {
  const { provider } = req.body;
  if (!provider) return res.status(400).json({ error: "provider is required" });
  return res.json({ success: true, activeProvider: provider });
});

// 8. AI Agent Status and Queue Management
aiRouter.get(["/ai/agents/status", "/agents/status"], (req, res) => {
  try {
    const data = agentQueueService.getAgentsStatus();
    return res.json({ success: true, ...data });
  } catch (err: any) {
    logger.error("Error getting agents status:", { error: err?.message || err });
    return res.status(500).json({ error: "Failed to get agents status" });
  }
});

aiRouter.post(["/ai/agents/task", "/agents/task"], (req, res) => {
  const { agentId, title, priority, source } = req.body;
  if (!agentId || !title) {
    return res.status(400).json({ error: "agentId and title are required" });
  }

  const task = agentQueueService.enqueueTask(agentId, title, priority, source);
  if (!task) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const updatedStatus = agentQueueService.getAgentsStatus();
  return res.json({ success: true, task, ...updatedStatus });
});

aiRouter.post(["/ai/agents/complete", "/agents/complete"], (req, res) => {
  const { agentId, taskId } = req.body;
  if (!agentId) {
    return res.status(400).json({ error: "agentId is required" });
  }

  const success = agentQueueService.completeTask(agentId, taskId);
  if (!success) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const updatedStatus = agentQueueService.getAgentsStatus();
  return res.json({ success: true, ...updatedStatus });
});

aiRouter.post(["/ai/agents/toggle", "/agents/toggle"], (req, res) => {
  const { agentId } = req.body;
  if (!agentId) {
    return res.status(400).json({ error: "agentId is required" });
  }

  const updatedAgent = agentQueueService.toggleStatus(agentId);
  if (!updatedAgent) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const updatedStatus = agentQueueService.getAgentsStatus();
  return res.json({ success: true, agent: updatedAgent, ...updatedStatus });
});

aiRouter.post(["/ai/agents/clear", "/agents/clear"], (req, res) => {
  const { agentId } = req.body;
  if (!agentId) {
    return res.status(400).json({ error: "agentId is required" });
  }

  const success = agentQueueService.clearQueue(agentId);
  if (!success) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const updatedStatus = agentQueueService.getAgentsStatus();
  return res.json({ success: true, ...updatedStatus });
});

export default aiRouter;
