const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

async function run() {
  const rl = readline.createInterface({ input, output });

  console.log('\n=========================================');
  console.log('  VideoTagebuch Konfigurations-Assistent ');
  console.log('=========================================\n');

  // 1. Zyklus Startdatum
  const defaultDate = '2026-08-10';
  const startInput = await rl.question(`Erster Tag des Zyklus (YYYY-MM-DD) [Standard: ${defaultDate}]: `);
  const zyklus_start = startInput.trim() || defaultDate;

  // 2. Reihenfolge
  console.log('\n--- 1. Reihenfolge festlegen ---');
  console.log('Gib die Namen der Reihe nach ein.');
  console.log('Tippe "pause" für einen Pausentag (null).');
  console.log('Drücke einfach ENTER ohne Eingabe, wenn du fertig bist.\n');

  const reihenfolge = [];
  while (true) {
    const name = await rl.question(`Position ${reihenfolge.length + 1}: `);
    const trimmed = name.trim();
    if (!trimmed) break;

    if (trimmed.toLowerCase() === 'pause' || trimmed.toLowerCase() === 'null') {
      reihenfolge.push(null);
    } else {
      reihenfolge.push(trimmed);
    }
  }

  // 3. E-Mails
  console.log('\n--- 2. Erlaubte Projekt-Konten (werden gehasht) ---');
  console.log('Gib die E-Mail-Adressen ein.');
  console.log('Drücke einfach ENTER ohne Eingabe, wenn du fertig bist.\n');

  const plainEmails = [];
  while (true) {
    const email = await rl.question(`E-Mail ${plainEmails.length + 1}: `);
    const trimmed = email.trim();
    if (!trimmed) break;
    plainEmails.push(trimmed);
  }

  rl.close();

  // 4. Hashes berechnen
  const konten_hashes = plainEmails.map(hashEmail);

  // 5. Zusammenfassung & Speichern
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const configPath = path.join(dataDir, 'config.json');
  const configData = {
    reihenfolge,
    zyklus_start,
    konten_hashes
  };

  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

  console.log('\n=========================================');
  console.log(`✅ Datei erfolgreich gespeichert: ${configPath}`);
  console.log(`- Startdatum:   ${zyklus_start}`);
  console.log(`- Reihenfolge:  ${reihenfolge.map(n => n === null ? '(Pause)' : n).join(' -> ')}`);
  console.log(`- Konten:       ${konten_hashes.length} E-Mails sicher gehasht gespeichert.`);
  console.log('=========================================\n');
}

run().catch(console.error);
