import https from 'https';
import fs from 'fs';
import path from 'path';

let offset = 0;
const OFFSET_DIR = '/app/data';
const OFFSET_FILE = '/app/data/max_offset.json';

function getValidOffsetFile(): string {
  try {
    if (!fs.existsSync(OFFSET_DIR)) {
      fs.mkdirSync(OFFSET_DIR, { recursive: true });
    }
    return OFFSET_FILE;
  } catch (err) {
    const fallbackDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, 'max_offset.json');
  }
}

console.log('[AUTO-MAX-POLLER] Started');

export async function poll() {
  const token = process.env.MAX_BOT_TOKEN;
  if (!token) {
    return;
  }

  const offsetFile = getValidOffsetFile();
  try {
    if (fs.existsSync(offsetFile)) {
      const saved = JSON.parse(fs.readFileSync(offsetFile, 'utf8'));
      if (typeof saved?.offset === 'number') {
        offset = saved.offset;
      }
    }
  } catch (e) {
    // Suppress file read error
  }

  try {
    const req = https.request(
      {
        hostname: 'platform-api2.max.ru',
        path: `/updates?offset=${offset}&limit=10&timeout=5`,
        method: 'GET',
        headers: { Authorization: token }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ok && Array.isArray(json.result) && json.result.length > 0) {
              console.log(`[AUTO-MAX-POLLER] Got Message: ${json.result.length} update(s) received`);
              const last = json.result[json.result.length - 1];
              offset = last.update_id + 1;
              try {
                fs.writeFileSync(offsetFile, JSON.stringify({ offset }));
              } catch (writeErr) {
                console.error('[AUTO-MAX-POLLER] Error saving offset:', writeErr);
              }

              // Forward each update to the internal webhook
              for (const item of json.result) {
                fetch('http://localhost:3000/api/max/webhook', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(item)
                }).catch((forwardErr) => {
                  console.error('[AUTO-MAX-POLLER] Forward error:', forwardErr);
                });
              }
            }
          } catch (parseErr) {
            // Ignore parse errors on malformed payloads
          }
        });
      }
    );

    req.on('error', (e) => {
      console.error('[AUTO-MAX-POLLER] Network Error:', e.message);
    });

    req.end();
  } catch (netErr: any) {
    console.error('[AUTO-MAX-POLLER] Unexpected request error:', netErr?.message || netErr);
  }
}

// Run immediately and then every 6 seconds
poll();
setInterval(poll, 6000);
