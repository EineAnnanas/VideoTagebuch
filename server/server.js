const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const webPush = require('web-push');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const db = new sqlite3.Database(path.join(DATA_DIR, 'reminders.db'));

// Setup DB table. Columns added later are migrated below, so existing
// databases keep their subscriptions.
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE,
    keys_p256dh TEXT,
    keys_auth TEXT,
    time TEXT,
    timezone TEXT
  )`);

  // Archived videos. Filled by the archiver (#6, phase 3); for now
  // only the status matters: 'bereit' = safe to delete in Drive.
  db.run(`CREATE TABLE IF NOT EXISTS archiv (
    file_id TEXT PRIMARY KEY,
    status TEXT
  )`);

  // "Behalten"-Markierungen: one row per (file, person). A video marked
  // by at least one person keeps its original in the archive (#6).
  db.run(`CREATE TABLE IF NOT EXISTS markierungen (
    file_id TEXT NOT NULL,
    person TEXT NOT NULL,
    created INTEGER NOT NULL,
    PRIMARY KEY (file_id, person)
  )`);

  db.all('PRAGMA table_info(reminders)', (err, cols) => {
    if (err) return console.error('[db] Migration fehlgeschlagen:', err);
    const vorhanden = new Set(cols.map(c => c.name));
    const neu = [
      ['person', 'TEXT'],
      ['notify_reminder', 'INTEGER NOT NULL DEFAULT 1'],
      ['notify_comments', 'INTEGER NOT NULL DEFAULT 1'],
      ['notify_uploads', 'INTEGER NOT NULL DEFAULT 1']
    ];
    neu.forEach(([name, typ]) => {
      if (!vorhanden.has(name)) {
        db.run(`ALTER TABLE reminders ADD COLUMN ${name} ${typ}`);
        console.log(`[db] Spalte ${name} ergänzt`);
      }
    });
  });
});

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

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('[config] Fehler beim Lesen:', err.message);
  }
  return {};
}

function sameName(a, b) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ============ WER IST DRAN ============

/** "YYYY-MM-DD" of `date` as seen in `timezone`. */
function dayInTz(date, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

/** Same rotation as werIstDran() in index.html. */
function whoseDay(dayKey, config) {
  const order = config.reihenfolge || [];
  if (!order.length || !config.zyklus_start) return null;
  const start = Date.parse(config.zyklus_start + 'T00:00:00Z');
  const day = Date.parse(dayKey + 'T00:00:00Z');
  const diff = Math.round((day - start) / 86400000);
  return order[((diff % order.length) + order.length) % order.length];
}

// ============ ANMELDUNG ============
//
// Only project members may subscribe or trigger notifications. The browser
// sends its Google access token; we ask Drive whose it is and compare the
// hashed email with konten_hashes from config.json (same check as the app).

const tokenCache = new Map();   // token -> { ok, until }

async function isMember(token) {
  if (!token || typeof token !== 'string') return false;
  const cached = tokenCache.get(token);
  if (cached && cached.until > Date.now()) return cached.ok;

  let ok = false;
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.ok) {
      const email = ((await res.json()).user || {}).emailAddress || '';
      const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
      const allowed = readConfig().konten_hashes || [];
      ok = !!email && (!allowed.length || allowed.includes(hash));
    }
  } catch (err) {
    console.error('[auth] Google nicht erreichbar:', err.message);
    return false;   // not cached: try again next time
  }

  tokenCache.set(token, { ok, until: Date.now() + 10 * 60 * 1000 });
  if (tokenCache.size > 500) {
    for (const [t, v] of tokenCache) if (v.until < Date.now()) tokenCache.delete(t);
  }
  return ok;
}

function bearer(req) {
  const h = req.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

async function requireMember(req, res, next) {
  if (await isMember(bearer(req))) return next();
  res.status(401).json({ error: 'Nicht angemeldet oder kein Projekt-Konto' });
}

// ============ ROUTEN ============

// Konfiguration an das Frontend senden
app.get('/api/config', (req, res) => {
  const configData = readConfig();
  // Server automatically adds the public key from .env
  configData.vapid_public_key = VAPID_PUBLIC_KEY;
  res.json(configData);
});

// Save subscription with the person and which notifications they want
app.post('/api/subscribe', requireMember, (req, res) => {
  const { subscription, time, timezone, person, prefs } = req.body || {};
  if (!subscription || !subscription.endpoint || !subscription.keys ||
      !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  if (!/^\d{2}:\d{2}$/.test(time || '')) {
    return res.status(400).json({ error: 'Invalid time' });
  }
  if (typeof person !== 'string' || !person.trim() || person.length > 100) {
    return res.status(400).json({ error: 'Invalid person' });
  }
  const tz = timezone && isValidTimezone(timezone) ? timezone : 'Europe/Berlin';
  const p = prefs || {};
  const flag = (v) => (v === false ? 0 : 1);

  // Keys are updated too: a re-subscription can reuse the endpoint with new keys.
  const query = `
    INSERT INTO reminders (endpoint, keys_p256dh, keys_auth, time, timezone,
                           person, notify_reminder, notify_comments, notify_uploads)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      keys_p256dh = excluded.keys_p256dh,
      keys_auth = excluded.keys_auth,
      time = excluded.time,
      timezone = excluded.timezone,
      person = excluded.person,
      notify_reminder = excluded.notify_reminder,
      notify_comments = excluded.notify_comments,
      notify_uploads = excluded.notify_uploads
  `;
  db.run(query, [
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    time,
    tz,
    person.trim(),
    flag(p.reminder),
    flag(p.comments),
    flag(p.uploads)
  ], (err) => {
    if (err) {
      console.error('[subscribe] DB-Fehler:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`[subscribe] ${endpointHost(subscription.endpoint)} ${person.trim()} um ${time} (${tz})`
      + ` erinnerung=${flag(p.reminder)} kommentare=${flag(p.comments)} uploads=${flag(p.uploads)}`);
    res.json({ success: true });
  });
});

// Which Drive files are archived and may be deleted by the app's cleanup.
app.get('/api/archiv/status', requireMember, (req, res) => {
  db.all("SELECT file_id FROM archiv WHERE status = 'bereit'", (err, rows) => {
    if (err) {
      console.error('[archiv] DB-Fehler:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ bereit: (rows || []).map(r => r.file_id) });
  });
});

// ============ MARKIERUNGEN (BEHALTEN) ============
//
// Names stay on the server: the browser only learns whether a video is
// marked to keep at all, and whether the asking person marked it.

const FILE_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function validPerson(p) {
  return typeof p === 'string' && !!p.trim() && p.length <= 100;
}

function markState(fileId, person, cb) {
  db.all('SELECT person FROM markierungen WHERE file_id = ?', [fileId], (err, rows) => {
    if (err) return cb(err);
    const list = rows || [];
    cb(null, { markiert: list.length > 0, meins: list.some(r => sameName(r.person, person)) });
  });
}

// { fileId: { markiert: true, meins } } for every file marked by anyone
app.get('/api/markierungen', requireMember, (req, res) => {
  const person = typeof req.query.person === 'string' ? req.query.person : '';
  db.all('SELECT file_id, person FROM markierungen', (err, rows) => {
    if (err) {
      console.error('[markierung] DB-Fehler:', err);
      return res.status(500).json({ error: err.message });
    }
    const out = {};
    (rows || []).forEach(r => {
      const e = out[r.file_id] || (out[r.file_id] = { markiert: true, meins: false });
      if (person && sameName(r.person, person)) e.meins = true;
    });
    res.json(out);
  });
});

// Mark or unmark a file; answers with { markiert, meins } for that file.
app.post('/api/markierung', requireMember, (req, res) => {
  const { fileId, person, an } = req.body || {};
  if (typeof fileId !== 'string' || !FILE_ID_RE.test(fileId)) {
    return res.status(400).json({ error: 'Invalid fileId' });
  }
  if (!validPerson(person)) return res.status(400).json({ error: 'Invalid person' });
  if (typeof an !== 'boolean') return res.status(400).json({ error: 'Invalid an' });

  const wer = person.trim().toLowerCase();
  const fertig = (err) => {
    if (err) {
      console.error('[markierung] DB-Fehler:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`[markierung] ${wer} ${an ? 'markiert' : 'entfernt Markierung'} ${fileId}`);
    markState(fileId, wer, (err2, state) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(state);
    });
  };
  if (an) {
    db.run('INSERT OR IGNORE INTO markierungen (file_id, person, created) VALUES (?, ?, ?)',
      [fileId, wer, Date.now()], fertig);
  } else {
    db.run('DELETE FROM markierungen WHERE file_id = ? AND person = ?', [fileId, wer], fertig);
  }
});

// Remove subscription (knowing the endpoint is proof enough)
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  db.run('DELETE FROM reminders WHERE endpoint = ?', [endpoint], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    console.log(`[unsubscribe] ${endpointHost(endpoint)}`);
    res.json({ success: true });
  });
});

// Someone uploaded or commented: tell everyone else who wants to know.
const lastUpload = new Map();      // "person|day" -> timestamp, to merge batches
const uploadedDays = new Set();    // "person|day", to skip the own-day reminder
const UPLOAD_MERGE_MS = 10 * 60 * 1000;

/** Forget uploads older than two days so the maps don't grow forever. */
function pruneUploadMemory(now) {
  const cutoff = dayInTz(new Date(now.getTime() - 2 * 86400000), 'Europe/Berlin');
  for (const key of uploadedDays) {
    if (key.split('|')[1] < cutoff) uploadedDays.delete(key);
  }
  for (const [key, ts] of lastUpload) {
    if (now.getTime() - ts > UPLOAD_MERGE_MS) lastUpload.delete(key);
  }
}

function formatDay(dayKey) {
  const [y, m, d] = dayKey.split('-');
  return `${d}.${m}.`;
}

function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

app.post('/api/notify', requireMember, (req, res) => {
  const { type, from, day, owner, count, text, endpoint } = req.body || {};
  if (!['upload', 'comment'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (typeof from !== 'string' || !from.trim() || from.length > 100) {
    return res.status(400).json({ error: 'Invalid from' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return res.status(400).json({ error: 'Invalid day' });

  const sender = from.trim();
  const today = dayInTz(new Date(), 'Europe/Berlin');

  if (type === 'upload') {
    uploadedDays.add(sender.toLowerCase() + '|' + day);
    const key = sender.toLowerCase() + '|' + day;
    const last = lastUpload.get(key) || 0;
    lastUpload.set(key, Date.now());
    if (Date.now() - last < UPLOAD_MERGE_MS) {
      console.log(`[notify] upload von ${sender} für ${day} zusammengefasst`);
      return res.json({ success: true, merged: true });
    }
  }

  const column = type === 'upload' ? 'notify_uploads' : 'notify_comments';
  db.all(`SELECT * FROM reminders WHERE ${column} = 1`, (err, rows) => {
    if (err) {
      console.error('[notify] DB-Fehler:', err);
      return res.status(500).json({ error: err.message });
    }
    const recipients = (rows || []).filter(r =>
      r.endpoint !== endpoint && !sameName(r.person, sender));

    recipients.forEach(row => {
      let payload;
      if (type === 'upload') {
        const n = Number(count) > 1 ? `${Number(count)} Clips` : 'ein Video';
        payload = {
          title: 'Neues Video',
          body: `${sender} hat ${n} hochgeladen` + (day === today ? '.' : ` (für den ${formatDay(day)}).`)
        };
      } else {
        const wessen = sameName(row.person, owner) ? 'dein Video'
          : (owner ? `das Video von ${owner}` : 'ein Video');
        payload = {
          title: `${sender} hat ${wessen} vom ${formatDay(day)} kommentiert`,
          body: clip(text, 140) || 'Neuer Kommentar'
        };
      }
      sendPush(row, payload);
    });
    console.log(`[notify] ${type} von ${sender} (${day}) an ${recipients.length} Empfänger`);
    res.json({ success: true, recipients: recipients.length });
  });
});

function sendPush(row, payload) {
  const sub = {
    endpoint: row.endpoint,
    keys: { p256dh: row.keys_p256dh, auth: row.keys_auth }
  };
  const host = endpointHost(row.endpoint);

  return webPush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: 'high' })
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

// Every minute: remind people whose day it is, at their chosen time.
cron.schedule('* * * * *', () => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  db.all('SELECT * FROM reminders WHERE notify_reminder = 1', (err, rows) => {
    if (err) return console.error('[cron] DB-Fehler:', err);
    if (!rows || !rows.length) return;

    const config = readConfig();
    const now = new Date();
    pruneUploadMemory(now);
    rows.forEach(row => {
      // One bad row (e.g. unknown timezone) must not stop everyone else's reminder.
      try {
        const tz = row.timezone || 'Europe/Berlin';
        const nowInTz = new Intl.DateTimeFormat('de-DE', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(now);
        if (nowInTz !== row.time) return;

        const day = dayInTz(now, tz);
        if (!sameName(whoseDay(day, config), row.person)) return;
        if (uploadedDays.has(row.person.trim().toLowerCase() + '|' + day)) {
          console.log(`[cron] #${row.id} hat heute schon hochgeladen, keine Erinnerung`);
          return;
        }

        sendPush(row, {
          title: 'Heute bist du dran!',
          body: 'Vergiss nicht, dein Video für heute aufzunehmen.'
        });
      } catch (e) {
        console.error(`[cron] Zeile #${row.id} übersprungen:`, e.message);
      }
    });
  });
});

app.listen(3000, () => console.log('Reminder service running on port 3000'));
