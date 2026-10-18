import { sqliteDb } from "../../db";
import { logger } from "../logger";
import { checkLegalUpdates } from "./legalCitations";

export interface TenantKnowledgeRow {
  id: number;
  tenant_id: string;
  topic: string;
  question_pattern: string;
  answer: string;
  guide_card: string;
}

export async function answerTenantQuestion(
  tenantId: string,
  text: string,
  context: any,
  isVoice: boolean,
  existingCoreProcessor: (text: string, ctx: any) => Promise<any>
): Promise<{ text: string; extra?: any; handled: boolean }> {
  const lowerText = text.toLowerCase().trim();

  try {
    if (sqliteDb) {
      const kbRows = sqliteDb.prepare("SELECT * FROM tenant_knowledge WHERE tenant_id = ?").all(tenantId) as TenantKnowledgeRow[];
      
      let bestRow: TenantKnowledgeRow | null = null;
      let highestOverlap = 0;

      for (const row of kbRows) {
        const patterns = row.question_pattern.toLowerCase().split("|").map(p => p.trim());
        for (const pattern of patterns) {
          if (pattern && lowerText.includes(pattern)) {
            const overlap = pattern.length;
            if (overlap > highestOverlap) {
              highestOverlap = overlap;
              bestRow = row;
            }
          }
        }
      }

      if (bestRow) {
        logger.info(`[TenantKnowledge] Matched tenant_knowledge: "${bestRow.topic}"`);
        let finalAnswer = bestRow.answer;
        finalAnswer = applyComplianceGuard(finalAnswer);

        let extra: any = null;
        if (bestRow.guide_card) {
          extra = {
            attachments: [
              {
                type: "inline_keyboard",
                payload: {
                  buttons: [
                    [
                      { type: "callback", text: bestRow.guide_card, payload: "consult_request", callback_data: "consult_request" }
                    ]
                  ]
                }
              }
            ]
          };
        }

        return { text: finalAnswer, extra, handled: true };
      }
    }
  } catch (err) {
    logger.error(`[TenantKnowledge] Error searching tenant_knowledge: ${err}`);
  }

  const legalRes = await checkLegalUpdates(tenantId, text);
  if (legalRes.matched) {
    let finalAnswer = legalRes.text || "";
    finalAnswer = applyComplianceGuard(finalAnswer);
    return { text: finalAnswer, handled: true, extra: legalRes.routeToHuman ? { routeToHuman: true } : undefined };
  }

  const fallbackRes = await existingCoreProcessor(text, context);
  let finalAnswer = fallbackRes.text || fallbackRes;
  if (typeof finalAnswer === "string") {
    finalAnswer = applyComplianceGuard(finalAnswer);
  }
  return {
    text: finalAnswer,
    extra: fallbackRes.extra || undefined,
    handled: true
  };
}

export function applyComplianceGuard(text: string): string {
  if (!text) return text;
  
  const sentences = text.split(/(?<=[.!?])\s+/);
  const redirection = "Каждый кейс индивидуален и зависит от множества факторов. Для точной оценки ваших шансов и составления персонального плана действий запишитесь на подробную консультацию с Катериной.";

  let changed = false;
  const processedSentences = sentences.map(sentence => {
    const lowerSentence = sentence.toLowerCase();
    if (lowerSentence.includes("гаранти") || lowerSentence.includes("100%") || lowerSentence.includes("одобрение гарантировано")) {
      changed = true;
      return redirection;
    }
    return sentence;
  });

  return changed ? processedSentences.join(" ") : text;
}
