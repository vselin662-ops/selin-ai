import { sqliteDb } from "../../db";
import { logger } from "../logger";
import { llmService } from "../core/LLMService";
import { SCORING_QUESTIONS } from "./scoring";

export function estimateDuration(buffer: Buffer): number {
  if (buffer.length > 44 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const byteRate = buffer.readUInt32LE(28);
    if (byteRate > 0) {
      return buffer.length / byteRate;
    }
  }
  // Default estimate: standard MP3 bitrate around 128kbps (16000 bytes/sec)
  return buffer.length / 16000;
}

export async function transcribeLongAudio(
  buffer: Buffer,
  transcribeFunc: (buf: Buffer) => Promise<string>
): Promise<string> {
  const duration = estimateDuration(buffer);
  let processedBuffer = buffer;

  if (duration > 300) {
    logger.warn(`[LongVoice] Audio exceeds 5 minutes (${duration.toFixed(1)}s). Truncating to 5 minutes.`);
    const maxBytes = 300 * 16000;
    processedBuffer = buffer.subarray(0, maxBytes);
  }

  const chunkDurationSec = 180; // 3 minutes
  if (duration <= chunkDurationSec) {
    return await transcribeFunc(processedBuffer);
  }

  logger.info(`[LongVoice] Slicing long audio (${duration.toFixed(1)}s) into 3-minute chunks.`);
  const chunkSizeBytes = chunkDurationSec * 16000;
  const chunks: Buffer[] = [];
  
  for (let offset = 0; offset < processedBuffer.length; offset += chunkSizeBytes) {
    chunks.push(processedBuffer.subarray(offset, offset + chunkSizeBytes));
  }

  const transcriptions: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    logger.info(`[LongVoice] Transcribing chunk ${i + 1}/${chunks.length}...`);
    try {
      const text = await transcribeFunc(chunks[i]);
      if (text && text.trim()) {
        transcriptions.push(text.trim());
      }
    } catch (err) {
      logger.error(`[LongVoice] Error transcribing chunk ${i + 1}: ${err}`);
    }
  }

  return transcriptions.join(" ");
}

export async function processLongTranscriptIfNeeded(
  chatId: string,
  transcript: string
): Promise<{ handled: boolean; text: string; extra?: any }> {
  const words = transcript.trim().split(/\s+/);
  if (words.length <= 150) {
    return { handled: false, text: transcript };
  }

  logger.info(`[LongVoice] Transcript is long (${words.length} words). Extracting structured JSON.`);

  const prompt = `Проанализируй следующий подробный рассказ кандидата на визу талантов США и извлеки информацию для ответов на первые два вопроса оценки профиля.
Вопрос 1: Получал ли кандидат профессиональные награды, премии или призы за выдающиеся достижения? (Да/Нет)
Вопрос 2: Состоит ли кандидат в профессиональных ассоциациях или сообществах, куда принимают на основе высоких достижений? (Да/Нет)

Верни строго JSON объект в формате:
{
  "q1": true,
  "q2": false,
  "reasoning": "краткое резюме достижений и опыта кандидата на русском языке"
}

Текст кандидата:
"${transcript}"`;

  try {
    const aiResponse = await llmService.smartCall(`longvoice_${chatId}`, prompt);
    // Find JSON in the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const q1 = !!parsed.q1;
      const q2 = !!parsed.q2;
      const reasoning = parsed.reasoning || "Информация извлечена из вашего сообщения.";

      // Initialize funnel state with the first two questions answered
      const answers = {
        1: q1,
        2: q2
      };

      if (sqliteDb) {
        sqliteDb.prepare("INSERT OR REPLACE INTO funnel_states (chat_id, current_question_index, answers) VALUES (?, ?, ?)")
          .run(chatId, 2, JSON.stringify(answers));
      }

      const replyText = `🎙️ **Анализ вашего голосового сообщения**

Я внимательно прослушала ваш рассказ и заполнила первые два вопроса анкеты:
1. **Награды:** ${q1 ? "✅ Да" : "❌ Нет"}
2. **Членство в ассоциациях:** ${q2 ? "✅ Да" : "❌ Нет"}

📋 **Резюме профиля:** ${reasoning}

Давайте продолжим оценку. 
**Вопрос 3 из 6:** Писали ли о вас, вашей работе или ваших проектах в СМИ, профессиональных журналах или крупных блогах?`;

      return {
        handled: true,
        text: replyText,
        extra: {
          attachments: [
            {
              type: "inline_keyboard",
              payload: {
                buttons: [
                  [
                    { type: "callback", text: "Да", payload: "score_yes_3", callback_data: "score_yes_3" },
                    { type: "callback", text: "Нет", payload: "score_no_3", callback_data: "score_no_3" }
                  ]
                ]
              }
            }
          ]
        }
      };
    }
  } catch (err) {
    logger.error(`[LongVoice] Error in JSON extraction: ${err}`);
  }

  return { handled: false, text: transcript };
}
