import { sqliteDb } from "../../db";
import { logger } from "../logger";
import { SCORING_QUESTIONS, evaluateAnswers } from "./fintech/scoring";

export interface FunnelState {
  chat_id: string;
  current_question_index: number;
  answers: string; // JSON
}

// Ensure the states table exists
try {
  if (sqliteDb) {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS funnel_states (
        chat_id TEXT PRIMARY KEY,
        current_question_index INTEGER,
        answers TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
} catch (err) {
  logger.error(`[Funnel] Error creating funnel_states table: ${err}`);
}

export function getWelcomeMessage(isVoice: boolean): { text: string; voiceText: string; extra: any } {
  const text = "Приветствую! Я виртуальный ассистент Катерины. Я помогу оценить ваши шансы на получение визы талантов или грин-карты США (O-1, EB-1A, EB-2 NIW), а также отвечу на ваши вопросы.";
  const voiceText = "Привет! Я ассистент Катерины. Помогу оценить ваши шансы на визу талантов или отвечу на вопросы. Выберите действие на кнопках ниже.";
  
  const extra = {
    attachments: [
      {
        type: "inline_keyboard",
        payload: {
          buttons: [
            [
              { type: "callback", text: "📊 Оценить профиль", payload: "score_start", callback_data: "score_start" },
              { type: "callback", text: "❓ Задать вопрос", payload: "ask_question", callback_data: "ask_question" }
            ],
            [
              { type: "callback", text: "📞 Консультация", payload: "consult_request", callback_data: "consult_request" }
            ]
          ]
        }
      }
    ]
  };

  return { text, voiceText, extra };
}

export async function handleFunnelCallback(chatId: string, payload: string): Promise<{ text: string; extra?: any; isVoiceOnly?: boolean }> {
  try {
    if (!sqliteDb) {
      return { text: "Ошибка базы данных." };
    }

    if (payload === "score_start") {
      sqliteDb.prepare("INSERT OR REPLACE INTO funnel_states (chat_id, current_question_index, answers) VALUES (?, ?, ?)").run(chatId, 0, "{}");
      const question = SCORING_QUESTIONS[0];
      return {
        text: `Вопрос 1 из 6:\n\n${question.text}`,
        extra: {
          attachments: [
            {
              type: "inline_keyboard",
              payload: {
                buttons: [
                  [
                    { type: "callback", text: "Да", payload: "score_yes_1", callback_data: "score_yes_1" },
                    { type: "callback", text: "Нет", payload: "score_no_1", callback_data: "score_no_1" }
                  ]
                ]
              }
            }
          ]
        }
      };
    }

    if (payload.startsWith("score_yes_") || payload.startsWith("score_no_")) {
      const parts = payload.split("_");
      const isYes = parts[1] === "yes";
      const qNum = parseInt(parts[2], 10);

      // Get current state
      const stateRow = sqliteDb.prepare("SELECT * FROM funnel_states WHERE chat_id = ?").get(chatId) as FunnelState | undefined;
      if (!stateRow) {
        return { text: "Пожалуйста, начните тест заново.", extra: getWelcomeMessage(false).extra };
      }

      const answers = JSON.parse(stateRow.answers || "{}");
      answers[qNum] = isYes;

      if (qNum < 6) {
        const nextQIndex = qNum; // since qNum is 1-indexed, next index is qNum
        const nextQuestion = SCORING_QUESTIONS[nextQIndex];
        sqliteDb.prepare("UPDATE funnel_states SET current_question_index = ?, answers = ?, updated_at = CURRENT_TIMESTAMP WHERE chat_id = ?")
          .run(nextQIndex, JSON.stringify(answers), chatId);

        return {
          text: `Вопрос ${nextQIndex + 1} из 6:\n\n${nextQuestion.text}`,
          extra: {
            attachments: [
              {
                type: "inline_keyboard",
                payload: {
                  buttons: [
                    [
                      { type: "callback", text: "Да", payload: `score_yes_${nextQIndex + 1}`, callback_data: `score_yes_${nextQIndex + 1}` },
                      { type: "callback", text: "Нет", payload: `score_no_${nextQIndex + 1}`, callback_data: `score_no_${nextQIndex + 1}` }
                    ]
                  ]
                }
              }
            ]
          }
        };
      } else {
        // Evaluate
        const res = evaluateAnswers(answers);
        
        // Clean state
        sqliteDb.prepare("DELETE FROM funnel_states WHERE chat_id = ?").run(chatId);

        // Save lead
        sqliteDb.prepare(`
          INSERT INTO leads (tenant_id, user_id, contact_info, status, score, recommended_program)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run("default_tenant", chatId, `ChatID: ${chatId}`, "new", res.score, res.recommendedProgram);

        return {
          text: res.report,
          extra: {
            attachments: [
              {
                type: "inline_keyboard",
                payload: {
                  buttons: [
                    [
                      { type: "callback", text: "📞 Записаться на консультацию", payload: "consult_request", callback_data: "consult_request" }
                    ]
                  ]
                }
              }
            ]
          }
        };
      }
    }

    if (payload === "consult_request") {
      // Save/update lead status
      sqliteDb.prepare(`
        INSERT INTO leads (tenant_id, user_id, contact_info, status)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET status = 'handoff'
      `).run("default_tenant", chatId, `ChatID: ${chatId}`, "handoff");

      return {
        text: "Передала вас Катерине, она ответит лично."
      };
    }

    if (payload === "ask_question") {
      return {
        text: "Пожалуйста, напишите ваш вопрос текстом или отправьте голосовое сообщение. Я найду ответ в базе знаний или передам Катерине."
      };
    }

  } catch (err) {
    logger.error(`[Funnel] Error in handleFunnelCallback: ${err}`);
  }

  return { text: "Что-то пошло не так. Попробуйте еще раз." };
}
