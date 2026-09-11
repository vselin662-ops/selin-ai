import { sqliteDb } from "../../db";
import { logger } from "../logger";
import { searchWeb } from "../services/WebSearchService";
import { llmService } from "../core/LLMService";

export interface LegalFact {
  topic: string;
  fact: string;
  source_url: string;
  source_date: string;
}

/**
 * Returns whether LegalScout is enabled via settings.
 */
export function getLegalScoutEnabled(): boolean {
  try {
    const row = sqliteDb.prepare("SELECT value FROM system_settings WHERE key = 'LEGAL_SCOUT'").get();
    return row ? row.value === '1' : false;
  } catch {
    return false;
  }
}

/**
 * Sets LegalScout enabled flag in settings.
 */
export function setLegalScoutEnabled(enabled: boolean): void {
  try {
    sqliteDb.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES ('LEGAL_SCOUT', ?, ?)
    `).run(enabled ? '1' : '0', new Date().toISOString());
  } catch (err: any) {
    logger.error(`Failed to set LEGAL_SCOUT in settings: ${err?.message || err}`);
  }
}

/**
 * Weekly scheduled run check. Runs research if at least 7 days have passed since the last run.
 */
export async function checkAndRunScheduledScout(): Promise<void> {
  if (!getLegalScoutEnabled()) {
    return;
  }

  try {
    let lastRun = 0;
    const row = sqliteDb.prepare("SELECT value FROM system_settings WHERE key = 'last_run_scout'").get();
    if (row && row.value) {
      lastRun = parseInt(row.value, 10);
    }

    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    if (now - lastRun >= oneWeekMs) {
      logger.info("[LegalScout] Starting scheduled weekly run...");
      await runLegalScoutResearch();
    }
  } catch (err: any) {
    logger.error(`[LegalScout] Error in checkAndRunScheduledScout: ${err?.message || err}`);
  }
}

/**
 * Start background check interval for scheduled run (e.g. every hour).
 */
export function startLegalScoutScheduler(): void {
  // Check once on startup
  checkAndRunScheduledScout().catch(err => logger.error("LegalScout scheduler initial run failed:", err));

  // Run periodic check every hour
  setInterval(() => {
    checkAndRunScheduledScout().catch(err => logger.error("LegalScout scheduler check failed:", err));
  }, 60 * 60 * 1000);
}

/**
 * Execute LegalScout research over whitelisted domains.
 */
export async function runLegalScoutResearch(isTest: boolean = false): Promise<LegalFact[]> {
  const startTime = Date.now();
  const whitelist = ["uscis.gov", "federalregister.gov", "congress.gov", "nytimes.com", "reuters.com"];

  // 1. Search whitelisted sites
  const allResults: any[] = [];
  for (const domain of whitelist) {
    try {
      const results = await searchWeb(`immigration updates 2026 site:${domain}`);
      allResults.push(...results);
    } catch (e: any) {
      logger.warn(`[LegalScout] Search failed for ${domain}: ${e?.message || e}`);
    }
  }

  // Filter to keep only whitelisted domains
  const filteredResults = allResults.filter(r => {
    try {
      const hostname = new URL(r.url).hostname.toLowerCase();
      return whitelist.some(d => hostname === d || hostname.endsWith("." + d));
    } catch {
      return false;
    }
  });

  const uniqueUrls = new Set<string>();
  const finalResults = filteredResults.filter(r => {
    if (uniqueUrls.has(r.url)) return false;
    uniqueUrls.add(r.url);
    return true;
  });

  // 2. Fetch existing updates to avoid duplicates
  let existingUpdates: any[] = [];
  try {
    existingUpdates = sqliteDb.prepare("SELECT topic, fact, source_url FROM legal_updates").all();
  } catch (e: any) {
    logger.error(`[LegalScout] Failed to fetch existing updates: ${e?.message || e}`);
  }

  // 3. Ask LLM to compare and extract new facts
  let newFacts: LegalFact[] = [];
  if (finalResults.length > 0) {
    const systemPrompt = `You are LegalScout, an expert legal research agent for US immigration laws.
Compare the new search results against our database of existing updates.
Identify and extract NEW, significant legal facts or updates from the search results that are NOT already represented in the existing updates.
Format the output strictly as a JSON array of objects. Do not include markdown wrappers like \`\`\`json.
Fields:
- topic: short topic/title of the update (e.g., "USCIS Fee Increase")
- fact: precise one-line legal fact summary (must be clear, factual, and informative)
- source_url: exact URL from the search results
- source_date: estimated date of the update in YYYY-MM-DD or readable format

Example Output:
[{"topic": "USCIS Fee Changes", "fact": "USCIS announced adjustment of certain immigration benefit request fees effective early 2026.", "source_url": "https://www.uscis.gov/newsroom/alerts", "source_date": "2026-01-30"}]

If no new updates are found, return an empty array: []`;

    const userPrompt = `Existing database updates:
${JSON.stringify(existingUpdates, null, 2)}

New search results:
${JSON.stringify(finalResults, null, 2)}`;

    try {
      const rawResponse = await llmService.call([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);

      let jsonText = (rawResponse || "").trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.slice(7);
      }
      if (jsonText.endsWith("```")) {
        jsonText = jsonText.slice(0, -3);
      }
      jsonText = jsonText.trim();

      if (jsonText) {
        newFacts = JSON.parse(jsonText);
      }
    } catch (e: any) {
      logger.error(`[LegalScout] LLM extraction or parsing failed: ${e?.message || e}`);
    }
  }

  // 4. Save new facts as 'pending'
  let addedCount = 0;
  for (const item of newFacts) {
    try {
      const generatedId = Math.floor(Math.random() * 10000000) + 1000;
      sqliteDb.prepare(`
        INSERT INTO legal_updates (id, tenant_id, topic, fact, source_url, source_date, status)
        VALUES (?, 'default', ?, ?, ?, ?, 'pending')
      `).run(generatedId, item.topic, item.fact, item.source_url, item.source_date);
      addedCount++;
    } catch (err: any) {
      logger.error(`[LegalScout] Failed to insert pending update: ${err?.message || err}`);
    }
  }

  const duration = Date.now() - startTime;
  logger.info(`scout_run(${duration}, ${whitelist.length})`);
  logger.info(`scout_pending_added(${addedCount})`);

  // Update last run time in settings (if not test)
  if (!isTest) {
    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO system_settings (key, value, updated_at)
        VALUES ('last_run_scout', ?, ?)
      `).run(String(Date.now()), new Date().toISOString());
    } catch (err: any) {
      logger.error(`[LegalScout] Failed to update last_run_scout: ${err?.message || err}`);
    }
  }

  // 5. Send notification to owner
  const OWNER = String(process.env.OWNER_CHAT_ID || '').trim();
  if (OWNER && addedCount > 0) {
    try {
      const { modernMaxAdapter } = await import("../../server");
      if (modernMaxAdapter) {
        // Fetch newly added pending facts to get their assigned IDs
        const pendingRows = sqliteDb.prepare("SELECT id, topic, fact, source_url, source_date FROM legal_updates WHERE status = 'pending' ORDER BY id DESC LIMIT ?").all(addedCount) as any[];
        // Reverse so they are in insertion order
        pendingRows.reverse();

        const list = pendingRows.map((row, idx) => {
          return `${idx + 1}. #${row.id} ${row.topic}\nFact: ${row.fact}\nSource: ${row.source_url} (${row.source_date})`;
        }).join('\n\n');

        const messageText = `LegalScout: ${addedCount} new facts pending\n\n${list}`;
        await modernMaxAdapter.safeSendMessageToChat(OWNER, messageText);
        logger.info("[LegalScout] Owner notification sent successfully.");
      }
    } catch (e: any) {
      logger.error(`[LegalScout] Failed to send owner notification: ${e?.message || e}`);
    }
  }

  return newFacts;
}

/**
 * Approves a pending legal update.
 */
export async function approveLegalFact(id: number): Promise<boolean> {
  try {
    const result = sqliteDb.prepare("UPDATE legal_updates SET status = 'active' WHERE id = ? AND status = 'pending'").run(id);
    if (result.changes > 0) {
      logger.info(`scout_approved(${id})`);
      return true;
    }
    return false;
  } catch (err: any) {
    logger.error(`[LegalScout] Error approving fact ${id}: ${err?.message || err}`);
    return false;
  }
}

/**
 * Rejects a pending legal update.
 */
export async function rejectLegalFact(id: number, reason: string): Promise<boolean> {
  try {
    const result = sqliteDb.prepare("UPDATE legal_updates SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(id);
    if (result.changes > 0) {
      logger.info(`scout_rejected(${id})`);
      logger.info(`[LegalScout] Fact ${id} rejected. Reason: ${reason}`);
      return true;
    }
    return false;
  } catch (err: any) {
    logger.error(`[LegalScout] Error rejecting fact ${id}: ${err?.message || err}`);
    return false;
  }
}

/**
 * Runs a complete self-test on the LegalScout agent.
 */
export async function runLegalScoutSelfTest(): Promise<void> {
  logger.info("=== STARTING LEGALSCOUT SELF-TEST ===");

  const testTopic = "Test Topic 2026";
  const testFact = "USCIS announced a new test procedure under test rule 2026.";
  const testUrl = "https://www.uscis.gov/test";
  const testDate = "2026-09-09";

  // 1. Manually insert a pending row
  logger.info("[Test] Creating a pending row...");
  sqliteDb.prepare("DELETE FROM legal_updates WHERE topic = ?").run(testTopic);
  const testGeneratedId = Math.floor(Math.random() * 10000000) + 1000;
  sqliteDb.prepare(`
    INSERT INTO legal_updates (id, tenant_id, topic, fact, source_url, source_date, status)
    VALUES (?, 'default', ?, ?, ?, ?, 'pending')
  `).run(testGeneratedId, testTopic, testFact, testUrl, testDate);

  const pendingRow = sqliteDb.prepare("SELECT * FROM legal_updates WHERE topic = ? AND status = 'pending'").get(testTopic);
  if (!pendingRow) {
    throw new Error("Self-test failure: Pending row was not created.");
  }
  logger.info(`[Test] Pending row created with ID: ${pendingRow.id}`);

  // 2. Form owner notification text
  const list = `1. #${pendingRow.id} ${pendingRow.topic}\nFact: ${pendingRow.fact}\nSource: ${pendingRow.source_url} (${pendingRow.source_date})`;
  const notificationText = `LegalScout: 1 new facts pending\n\n${list}`;
  logger.info(`[Test] Formed owner notification:\n${notificationText}`);

  // 3. Verify answer path ignores pending rows
  const { checkLegalUpdates } = await import("../services/legalCitations");
  logger.info("[Test] Checking that answer path ignores pending rows...");
  const matchPending = await checkLegalUpdates("default", "What are the rules for Test Topic 2026?");
  if (matchPending.matched) {
    throw new Error("Self-test failure: checkLegalUpdates matched a pending row!");
  }
  logger.info("[Test] Confirmed: pending row was ignored by checkLegalUpdates.");

  // 4. Approve the pending row
  logger.info(`[Test] Approving row ${pendingRow.id}...`);
  const approved = await approveLegalFact(pendingRow.id);
  if (!approved) {
    throw new Error("Self-test failure: Could not approve pending row.");
  }

  // 5. Verify the row is active and citable
  logger.info("[Test] Checking that approved row is active and citable...");
  const matchActive = await checkLegalUpdates("default", "What are the rules for Test Topic 2026?");
  if (!matchActive.matched || !matchActive.text?.includes(testFact) || !matchActive.text?.includes(testDate)) {
    throw new Error(`Self-test failure: Approved row was not found or lacked citation date. Result: ${JSON.stringify(matchActive)}`);
  }
  logger.info(`[Test] Confirmed: row is active and citable! Reply: "${matchActive.text}"`);

  // Clean up
  sqliteDb.prepare("DELETE FROM legal_updates WHERE id = ?").run(pendingRow.id);
  logger.info("[Test] Self-test clean up complete.");
  logger.info("=== LEGALSCOUT SELF-TEST PASSED SUCCESSFULLY ===");
}
