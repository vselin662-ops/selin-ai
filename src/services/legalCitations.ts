import { sqliteDb } from "../../db";
import { logger } from "../logger";

export interface LegalUpdate {
  id: number;
  tenant_id: string;
  topic: string;
  fact: string;
  source_url: string;
  source_date: string;
}

export async function checkLegalUpdates(tenantId: string, text: string): Promise<{ matched: boolean; text?: string; routeToHuman?: boolean }> {
  try {
    if (!sqliteDb) {
      return { matched: false };
    }

    const rows = sqliteDb.prepare("SELECT * FROM legal_updates WHERE tenant_id = ?").all(tenantId) as LegalUpdate[];
    if (rows.length === 0) {
      return { matched: false };
    }

    // Find the latest update by comparing source_date strings
    let latestUpdate = rows[0];
    for (const row of rows) {
      if (row.source_date > latestUpdate.source_date) {
        latestUpdate = row;
      }
    }

    const lowerText = text.toLowerCase();

    // Check if the query asks for something newer than our latest source_date
    let isNewerThanLatest = false;

    const yearMatch = lowerText.match(/\b(202[4-9]|203[0-9])\b/);
    if (yearMatch) {
      const userYear = parseInt(yearMatch[1], 10);
      const latestYearMatch = latestUpdate.source_date.match(/\b(202[4-9]|203[0-9])\b/);
      if (latestYearMatch) {
        const latestYear = parseInt(latestYearMatch[1], 10);
        if (userYear > latestYear) {
          isNewerThanLatest = true;
        }
      }
    }

    if (lowerText.includes("последние изменения") || lowerText.includes("новые правила") || lowerText.includes("свежие новости") || lowerText.includes("последние новости")) {
      isNewerThanLatest = true;
    }

    if (isNewerThanLatest) {
      logger.info(`[LegalCitations] Query is newer than latest source_date (${latestUpdate.source_date}). Routing to human.`);
      return {
        matched: true,
        routeToHuman: true,
        text: "Передала вас Катерине, она ответит лично."
      };
    }

    // Find a matching update based on keyword overlap
    let bestMatch: LegalUpdate | null = null;
    let highestScore = 0;

    for (const row of rows) {
      let score = 0;
      const topicWords = row.topic.toLowerCase().split(/[^a-zа-яё0-9]+/i).filter(w => w.length > 2);
      for (const word of topicWords) {
        if (lowerText.includes(word)) {
          score += 2;
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = row;
      }
    }

    if (bestMatch && highestScore >= 2) {
      const citation = `по данным от ${bestMatch.source_date}`;
      const reply = `${bestMatch.fact} (источник: ${citation}).`;
      logger.info(`[LegalCitations] Matched legal update topic: "${bestMatch.topic}"`);
      return {
        matched: true,
        text: reply
      };
    }

  } catch (err) {
    logger.error(`[LegalCitations] Error in checkLegalUpdates: ${err}`);
  }

  return { matched: false };
}
