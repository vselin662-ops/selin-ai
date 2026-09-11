import { GoogleGenAI } from "@google/genai";
import { sqliteDb } from "../../db";
import { logger } from "../logger";

export interface ImageEditResult {
  ok: boolean;
  buffer?: Buffer;
  mime?: string;
  provider?: string;
  error?: string;
  message?: string;
}

export interface ImageStyleRow {
  id?: number;
  name: string;
  trigger?: string;
  prompt_template: string;
}

/**
 * Проверка флага IMAGE_EDIT в настройках (default '0')
 */
export function isImageEditEnabled(): boolean {
  try {
    const row = sqliteDb.prepare("SELECT value FROM system_settings WHERE key = 'IMAGE_EDIT'").get() as { value?: string } | undefined;
    if (row && row.value !== undefined) {
      return row.value === '1';
    }
  } catch {
    // игнорируем ошибку при отсутствии таблицы
  }
  return process.env.IMAGE_EDIT === '1';
}

/**
 * Установка флага IMAGE_EDIT в настройках
 */
export function setImageEditSetting(enabled: boolean | string): void {
  const val = (enabled === true || enabled === '1') ? '1' : '0';
  try {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);
    sqliteDb.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES ('IMAGE_EDIT', ?, ?)
    `).run(val, new Date().toISOString());
  } catch (err: any) {
    logger.warn(`⚠️ [ImageEdit] Failed to update IMAGE_EDIT setting: ${err?.message || err}`);
  }
}

/**
 * Проверка, является ли текст запросом на редактирование изображения
 */
export function isImageEditRequest(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  return (
    /(?:замени|поменяй|удали|измени|смени)\s+(?:фон|задний\s+план)/i.test(t) ||
    /(?:сделай|перерисуй|обработай|стилизуй)\s+в\s+стиле/i.test(t) ||
    /(?:отредактируй|обработай|отфотошопь|стилизуй|перерисуй)\s+(?:фото|картинк|снимок|изображени)/i.test(t) ||
    /^(?:замени|поменяй|удали|измени)\s+фон$/i.test(t) ||
    /(?:замени|поменяй|добавь|убери|удали|измени)\s+на\s+(?:фото|картинк|снимк|изображени)/i.test(t)
  );
}

/**
 * Поиск подходящего стиля в таблице image_styles
 */
export function matchStyle(instruction: string): ImageStyleRow | null {
  try {
    const rows = sqliteDb.prepare("SELECT name, trigger, prompt_template FROM image_styles").all() as ImageStyleRow[];
    for (const row of rows) {
      if (row.trigger) {
        const regex = new RegExp(row.trigger, "i");
        if (regex.test(instruction)) {
          return row;
        }
      }
    }
  } catch (err: any) {
    logger.warn(`⚠️ [ImageEdit] Error querying image_styles: ${err?.message || err}`);
  }
  return null;
}

/**
 * Основной сервис редактирования изображений
 * edit(imageBuffer, mime, instruction)
 */
export async function edit(
  imageBuffer: Buffer,
  mime: string,
  instruction: string
): Promise<ImageEditResult> {
  // 1. Проверка размера входного изображения (> 7 МБ)
  if (!imageBuffer || imageBuffer.length > 7 * 1024 * 1024) {
    const sizeMb = imageBuffer ? (imageBuffer.length / (1024 * 1024)).toFixed(1) : '0';
    logger.warn(`⚠️ [ImageEdit] Input image too large: ${sizeMb}MB > 7MB`);
    return {
      ok: false,
      error: "image_too_large",
      message: "Картинка слишком тяжёлая (больше 7 МБ). Пожалуйста, пришлите файл или скриншот поменьше, чтобы я мог её обработать!"
    };
  }

  // 2. Проверка соответствия стилю в image_styles
  const matchedStyle = matchStyle(instruction);
  let finalPrompt = instruction;
  if (matchedStyle) {
    logger.info(`[ImageEdit] style_match(${matchedStyle.name})`);
    finalPrompt = matchedStyle.prompt_template || instruction;
  }

  const timeoutMs = 60000;

  // 3. Provider 1: Gemini image editing (Nano Banana family model, existing Gemini key)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    logger.info(`[ImageEdit] image_edit_start(gemini)`);
    const startGemini = Date.now();
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";

      const apiCall = ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: mime || "image/jpeg"
              }
            },
            {
              text: finalPrompt
            }
          ]
        }
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 60s")), timeoutMs)
      );

      const response: any = await Promise.race([apiCall, timeoutPromise]);
      let geminiBuffer: Buffer | null = null;
      let geminiMime = "image/png";

      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            geminiBuffer = Buffer.from(part.inlineData.data, "base64");
            geminiMime = part.inlineData.mimeType || "image/png";
            break;
          }
        }
      }

      if (geminiBuffer && geminiBuffer.length > 0) {
        const ms = Date.now() - startGemini;
        logger.info(`[ImageEdit] image_edit_ok(gemini, ${ms})`);
        return {
          ok: true,
          buffer: geminiBuffer,
          mime: geminiMime,
          provider: "gemini"
        };
      } else {
        throw new Error("No image output returned in Gemini response parts");
      }
    } catch (geminiErr: any) {
      const errMsg = geminiErr?.message || String(geminiErr);
      if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
        logger.warn(`Gemini key quota issue, owner needs to check GEMINI_API_KEY has image generation access`);
      }
      logger.warn(`[ImageEdit] image_edit_fail(gemini, ${errMsg})`);
    }
  } else {
    logger.warn(`[ImageEdit] image_edit_fail(gemini, missing_gemini_api_key)`);
  }

  // 4. Provider 2: Pollinations kontext fallback (POST to https://image.pollinations.ai/prompt)
  logger.info(`[ImageEdit] image_edit_start(pollinations)`);
  const startPollinations = Date.now();
  try {
    const pollinationsUrl = `https://image.pollinations.ai/prompt`;

    const polRes = await fetch(pollinationsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: finalPrompt.slice(0, 1000),
        model: "kontext",
        nologo: true
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (polRes.ok) {
      const contentType = polRes.headers.get("content-type") || "";
      if (contentType.includes("image")) {
        const arrayBuf = await polRes.arrayBuffer();
        const polBuffer = Buffer.from(arrayBuf);
        if (polBuffer && polBuffer.length > 0) {
          const ms = Date.now() - startPollinations;
          logger.info(`[ImageEdit] image_edit_ok(pollinations, ${ms})`);
          return {
            ok: true,
            buffer: polBuffer,
            mime: contentType,
            provider: "pollinations"
          };
        }
      }
      throw new Error(`Invalid response format or empty buffer, content-type: ${contentType}`);
    } else {
      throw new Error(`HTTP ${polRes.status}: ${polRes.statusText}`);
    }
  } catch (pollErr: any) {
    const errMsg = pollErr?.message || String(pollErr);
    logger.warn(`[ImageEdit] image_edit_fail(pollinations, ${errMsg})`);
  }

  // 5. Все провайдеры недоступны -> { ok: false, error: "image_edit_unavailable" } + log
  logger.warn(`[ImageEdit] image_edit_fail(all, image_edit_unavailable)`);
  return {
    ok: false,
    error: "image_edit_unavailable",
    message: "В данный момент функция редактирования фото временно недоступна из-за ограничений провайдера, но вы можете прислать обычный текстовый запрос, и я нарисую для вас новую картинку!"
  };
}
