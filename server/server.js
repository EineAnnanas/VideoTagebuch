const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const webPush = require('web-push');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(path.join(__dirname, 'data', 'reminders.db'));

// Setup DB table
db.run(`CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE,
  keys_p256dh TEXT,
  keys_auth TEXT,
  time TEXT,
  timezone TEXT
)`);

// Apple's push service (web.push.apple.com) rejects VAPID JWTs whose
// subject is not a valid mailto: or https: URL (403 BadJwtToken).
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'https://github.com/EineAnnanas/VideoTagebuch').trim();
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY fehlen in der Umgebung – Push ist deaktiviert.');
} else {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log(`[push] VAPID konfiguriert (subject: ${VAPID_SUBJECT}, public key: ${VAPID_PUBLIC_KEY.slice(0, 12)}…)`);
}

function endpointHost(endpoint) {
  try { return new URL(endpoint).host; } catch (e) { return '?'; }
}

function isValidTimezone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
  catch (e) { return false; }
}

// Konfiguration an das Frontend senden
app.get('/api/config', (req, res) => {
  const configPath = path.join(__dirname, 'data', 'config.json');

  try {
    let configData = {};
    if (fs.existsSync(configPath)) {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Server automatically adds the public key from .env
    configData.vapid_public_key = VAPID_PUBLIC_KEY;

    res.json(configData);
  } catch (err) {
    console.error('[config] Fehler beim Lesen:', err);
    res.status(500).json({ error: "Error reading config file." });
  }
});

// Save subscription
app.post('/api/subscribe', (req, res) => {
  const { subscription, time, timezone } = req.body || {};
  if (!subscription || !subscription.endpoint || !subscription.keys ||
      !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  if (!/^\d{2}:\d{2}$/.test(time || '')) {
    return res.status(400).json({ error: 'Invalid time' });
  }
  const tz = timezone && isValidTimezone(timezone) ? timezone : 'Europe/Berlin';

  // Keys are updated too: a re-subscription can reuse the endpoint with new keys.
  const query = `
    INSERT INTO reminders (endpoint, keys_p256dh, keys_auth, time, timezone)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      keys_p256dh = excluded.keys_p256dh,
      keys_auth = excluded.keys_auth,
      time = excluded.time,
      timezone = excluded.timezone
  `;
  db.run(query, [
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    time,
    tz
  ], (err) => {
    if (err) {
      console.error('[subscribe] DB-Fehler:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`[subscribe] ${endpointHost(subscription.endpoint)} um ${time} (${tz})`);
    res.json({ success: true });
  });
});

// Remove subscription
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  db.run('DELETE FROM reminders WHERE endpoint = ?', [endpoint], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    console.log(`[unsubscribe] ${endpointHost(endpoint)}`);
    res.json({ success: true });
  });
});

function sendReminder(row) {
  const sub = {
    endpoint: row.endpoint,
    keys: { p256dh: row.keys_p256dh, auth: row.keys_auth }
  };
  const payload = JSON.stringify({
    title: 'Video Tagebuch',
    body: 'Vergiss nicht, deine Videos heute aufzunehmen!'
  });
  const host = endpointHost(row.endpoint);

  return webPush.sendNotification(sub, payload, { TTL: 60 * 60 * 12, urgency: 'high' })
    .then((result) => {
      console.log(`[push] #${row.id} -> ${host}: ${result.statusCode}`);
    })
    .catch((err) => {
      console.error(`[push] #${row.id} -> ${host} fehlgeschlagen: ${err.statusCode || ''} ${err.body || err.message}`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired, clean it up
        db.run('DELETE FROM reminders WHERE id = ?', [row.id]);
        console.log(`[push] #${row.id} abgelaufen, gelöscht`);
      }
    });
}

// Check every minute if any user needs a notification
cron.schedule('* * * * *', () => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  db.all('SELECT * FROM reminders', (err, rows) => {
    if (err) return console.error('[cron] DB-Fehler:', err);
    if (!rows) return;

    const now = new Date();
    rows.forEach(row => {
      // One bad row (e.g. unknown timezone) must not stop everyone else's reminder.
      try {
        const nowInTz = new Intl.DateTimeFormat('de-DE', {
          timeZone: row.timezone || 'Europe/Berlin',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23'
        }).format(now);

        if (nowInTz === row.time) sendReminder(row);
      } catch (e) {
        console.error(`[cron] Zeile #${row.id} übersprungen:`, e.message);
      }
    });
  });
});

app.listen(3000, () => console.log('Reminder service running on port 3000'));
