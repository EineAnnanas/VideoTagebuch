const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const webPush = require('web-push');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

const vapidSubject = process.env.DUCKDNS_SUBDOMAIN
  ? `https://${process.env.DUCKDNS_SUBDOMAIN}.duckdns.org`
  : 'https://localhost';

webPush.setVapidDetails(
  vapidSubject,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const fs = require('fs');

// Neue Route: Konfiguration an das Frontend senden
app.get('/api/config', (req, res) => {
  const configPath = path.join(__dirname, 'data', 'config.json');

  try {
    let configData = {};
    if (fs.existsSync(configPath)) {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Server automatically adds the public key from .env
    configData.vapid_public_key = process.env.VAPID_PUBLIC_KEY || '';

    res.json(configData);
  } catch (err) {
    res.status(500).json({ error: "Error reading config file." });
  }
});

// Save subscription
app.post('/api/subscribe', (req, res) => {
  const { subscription, time, timezone } = req.body;
  if (!subscription || !time) return res.status(400).send('Invalid payload');

  const query = `
    INSERT INTO reminders (endpoint, keys_p256dh, keys_auth, time, timezone)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET time = excluded.time, timezone = excluded.timezone
  `;
  db.run(query, [
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    time,
    timezone || 'Europe/Berlin'
  ], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Check every minute if any user needs a notification
cron.schedule('* * * * *', () => {
  db.all('SELECT * FROM reminders', (err, rows) => {
    if (err || !rows) return;

    rows.forEach(row => {
      const nowInTz = new Intl.DateTimeFormat('de-DE', {
        timeZone: row.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date());

      if (nowInTz === row.time) {
        const sub = {
          endpoint: row.endpoint,
          keys: { p256dh: row.keys_p256dh, auth: row.keys_auth }
        };
        const payload = JSON.stringify({
          title: 'Video Tagebuch',
          body: 'Vergiss nicht, deine Videos heute aufzunehmen!'
        });

        webPush.sendNotification(sub, payload).catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription expired, clean it up
            db.run('DELETE FROM reminders WHERE id = ?', [row.id]);
          }
        });
      }
    });
  });
});

app.listen(3000, () => console.log('Reminder service running on port 3000'));
