import https from 'https';
import fs from 'fs';
import path from 'path';

console.log('⚡ [AUTO-MAX-POLLER] Module Loaded & Initializing...');

export type PollerUpdateHandler = (update: any) => Promise<void>;

let pollerHandler: PollerUpdateHandler | null = null;

/**
 * Registers an in-process direct handler for received updates.
 * Allows instant, zero-latency update processing without relying purely on local HTTP loopback.
 */
export function setPollerWebhookHandler(handler: PollerUpdateHandler) {
  pollerHandler = handler;
}

let currentMarker: number | string = 0;
let isPollingActive = false;

const OFFSET_DIR = '/app/data';
const OFFSET_FILE = '/app/data/max_offset.json';

function getValidOffsetFile(): string {
  try {
    if (!fs.existsSync(OFFSET_DIR)) {
      fs.mkdirSync(OFFSET_DIR, { recursive: true });
    }
    return OFFSET_FILE;
  } catch {
    const fallbackDir = path.resolve(process.cwd(), 'data');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      return path.join(fallbackDir, 'max_offset.json');
    } catch {
      return OFFSET_FILE;
    }
  }
}

function loadSavedMarker(): void {
  const file = getValidOffsetFile();
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data?.marker !== undefined && data.marker !== null) {
        currentMarker = data.marker;
      } else if (data?.offset !== undefined && data.offset !== null) {
        currentMarker = data.offset;
      }
    }
  } catch {
    // Ignore load error
  }
}

function saveMarker(marker: number | string): void {
  const file = getValidOffsetFile();
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify({ marker, offset: marker }));
  } catch (err) {
    console.error('[AUTO-MAX-POLLER] Error saving offset/marker:', err);
  }
}

console.log('[AUTO-MAX-POLLER] Started');
loadSavedMarker();

export async function poll(): Promise<void> {
  const token = process.env.MAX_BOT_TOKEN;
  if (!token) {
    return;
  }

  if (isPollingActive) {
    return;
  }
  isPollingActive = true;

  try {
    loadSavedMarker();

    let queryPath = `/updates?limit=20&timeout=5`;
    if (currentMarker !== undefined && currentMarker !== null && currentMarker !== 0 && currentMarker !== '0') {
      queryPath = `/updates?marker=${encodeURIComponent(currentMarker)}&offset=${encodeURIComponent(currentMarker)}&limit=20&timeout=5`;
    }

    const req = https.request(
      {
        hostname: 'platform-api2.max.ru',
        path: queryPath,
        method: 'GET',
        headers: {
          Authorization: token,
          'User-Agent': 'SelinAI-MaxPoller/2.0'
        },
        timeout: 10000
      },
      (res) => {
        let rawData = '';

        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', async () => {
          isPollingActive = false;
          try {
            if (!rawData || rawData.trim() === '') {
              return;
            }

            const json = JSON.parse(rawData);

            // MAX Bot API returns updates in `updates` or Telegram-compatible `result`
            const updatesList: any[] = Array.isArray(json.updates)
              ? json.updates
              : Array.isArray(json.result)
              ? json.result
              : Array.isArray(json)
              ? json
              : [];

            // Update marker/offset for next iteration
            let newMarker: any = undefined;
            if (json.marker !== undefined && json.marker !== null) {
              newMarker = json.marker;
            } else if (json.offset !== undefined && json.offset !== null) {
              newMarker = json.offset;
            } else if (updatesList.length > 0) {
              const last = updatesList[updatesList.length - 1];
              if (typeof last.update_id === 'number') {
                newMarker = last.update_id + 1;
              } else if (typeof last.timestamp === 'number') {
                newMarker = last.timestamp;
              }
            }

            if (newMarker !== undefined) {
              currentMarker = newMarker;
              saveMarker(newMarker);
            }

            if (updatesList.length > 0) {
              console.log(`[AUTO-MAX-POLLER] Got Message: ${updatesList.length} update(s) received`);

              for (const update of updatesList) {
                // 1. Process directly in-process if handler is registered
                if (pollerHandler) {
                  try {
                    await pollerHandler(update);
                  } catch (handlerErr) {
                    console.error('[AUTO-MAX-POLLER] In-process handler error:', handlerErr);
                  }
                }

                // 2. Also forward to internal webhook endpoint for consistency & logging
                const port = process.env.PORT || 3000;
                const forwardPayload = JSON.stringify(update);

                fetch(`http://127.0.0.1:${port}/api/max/webhook`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: forwardPayload
                }).catch(() => {
                  // Fallback to localhost if 127.0.0.1 fails
                  fetch(`http://localhost:${port}/api/max/webhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: forwardPayload
                  }).catch((forwardErr) => {
                    console.error('[AUTO-MAX-POLLER] Forward error:', forwardErr);
                  });
                });
              }
            }
          } catch (parseErr) {
            // Ignore parse errors on malformed payloads
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      isPollingActive = false;
    });

    req.on('error', (e) => {
      console.error('[AUTO-MAX-POLLER] Network Error:', e.message);
      isPollingActive = false;
    });

    req.end();
  } catch (netErr: any) {
    console.error('[AUTO-MAX-POLLER] Unexpected request error:', netErr?.message || netErr);
    isPollingActive = false;
  }
}

// Poll every 6 seconds as requested
setInterval(poll, 6000);

// Kick off initial poll after server bootstrap delay
setTimeout(() => {
  poll().catch(() => {});
}, 1500);
