## Eine Person hinzufügen

Drei Schritte, mehr nicht:

1. **Unterordner anlegen** im geteilten Ordner, Name enthält den
   Vornamen: `03-joshua`. Die Seite ordnet über diesen Namen zu.
2. **Freigeben:** Hauptordner mit der Google-Adresse der Person teilen,
   Rolle *Bearbeiter*.
3. **Als Testnutzer eintragen** in der Cloud Console unter
   *Google Auth Platform → Audience → Test users*.

Dazu in `index.html` den Namen in `CONFIG.REIHENFOLGE` ergänzen und
`ZYKLUS_START` auf den Montag setzen, ab dem die neue Reihenfolge gilt.

> Vergisst du Schritt 3, meldet Google „Zugriff blockiert".
> Vergisst du den Ordner, steht im Tagesfeld „noch kein Ordner angelegt".

**Eigene Projekt-Konten sind nicht nötig.** Jeder meldet sich mit dem
Google-Konto an, das er ohnehin benutzt. Durch die Rotation ist jeder
nur alle acht Tage dran – das sind rund 1,5 GB von seinen 15 GB, und
es wächst nicht, weil nach 30 Tagen dieselbe Menge wieder abfließt.


# VideoTagebuch

Ein gemeinsames, rundenbasiertes Video-Tagebuch, umgesetzt als datenschutzfreundliche **Progressive Web App (PWA)**. 

Das Frontend läuft als komplett statische Seite über **GitHub Pages**, während ein leichtgewichtiges Backend auf einem heimischen **Raspberry Pi (via Docker)** die Konfiguration bereitstellt und individuelle Web-Push-Erinnerungen verschickt.

---

## 🔒 Datenschutz & Anonymität
- **Keine Klartext-E-Mails auf GitHub:** Zulässige Projekt-E-Mail-Adressen werden vor dem Speichern per **SHA-256** gehasht. Weder im Git-Repository noch im Netzwerkverkehr tauchen echte Adressen auf.
- **Keine Kontaktdaten-Sammlung:** Push-Erinnerungen funktionieren rein über den Web-Push-Standard des Browsers (anonyme kryptografische Tokens). Es werden keine Telefonnummern, Namen oder E-Mails für Benachrichtigungen gespeichert.
- **Generisches Repository:** Die Reihenfolge, Termine und Nutzerdaten liegen ausschließlich auf dem privaten Server. Der Quellcode auf GitHub enthält keinerlei persönliche Daten.

---

## 🛠️ Voraussetzungen
- **Frontend:** Beliebiger Webspace oder GitHub Pages (kostenlos, HTTPS inklusive).
- **Backend (Server):** Raspberry Pi (oder Server) mit installiertem **Docker** und **Docker Compose**.
- **Netzwerk:** Ein kostenloser Account bei [DuckDNS](https://www.duckdns.org/) und Zugriff auf den heimischen Router (für Portweiterleitungen).

---

## 🚀 Schritt-für-Schritt-Einrichtung

### 1. Server-Dateien vorbereiten
Kopiere das Verzeichnis `server/` auf deinen Raspberry Pi (z. B. nach `~/tagebuch-server`):

```text
tagebuch-server/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
├── setup.js
└── .env
```

### 2. VAPID-Schlüssel generieren
Das Backend benötigt ein VAPID-Schlüsselpaar für den Web-Push-Dienst. Führe im Server-Ordner folgenden Befehl aus:

```bash
npx web-push generate-vapid-keys
```
Kopiere den generierten **Public Key** und **Private Key**.

### 3. Umgebungsvariablen (`.env`)
Benenne im Ordner `server/` die Datei `env.exmaple` in `.env` um:

```env
# Web-Push Schlüssel
VAPID_PUBLIC_KEY=DEIN_PUBLIC_KEY_HIER
VAPID_PRIVATE_KEY=DEIN_PRIVATE_KEY_HIER

# DuckDNS Konfiguration
DUCKDNS_SUBDOMAIN=deine-subdomain   # ohne .duckdns.org
DUCKDNS_TOKEN=dein-duckdns-token
```

### 4. Interaktiven Konfigurations-Assistenten ausführen
Erstelle die Konfiguration (Zyklus-Startdatum, Reihenfolge der Personen, erlaubte Konten) mit dem beiliegenden Terminal-Wizard:

```bash
node setup.js
```
Der Assistent führt dich Schritt für Schritt durch die Einrichtung, hasht alle eingegebenen E-Mail-Adressen automatisch und speichert das Ergebnis privat in `data/config.json`.

*(Um später Personen hinzuzufügen oder den Zyklus zu ändern, führst du einfach erneut `node setup.js` aus).*

### 5. Docker-Container starten
Starte den gesamten Stack (Reminder-Service, DuckDNS-Updater und Nginx Proxy Manager):

```bash
docker compose up -d
```

---

## 🌐 Cloudflare Tunnel
1. Logge dich im Cloudflare Dashboard ein und öffne **Zero Trust** → **Networks** → **Tunnels**.
2. Erstelle einen neuen Tunnel (Typ: *Cloudflared*) mit beliebigem Namen (z. B. `tagebuch`).
3. Kopiere den Tunnel-Token (`eyJh...`).
4. Füge unter **Public Hostnames** eine neue Route hinzu:
   - **Subdomain:** z. B. `tagebuch`
   - **Domain:** Wähle deine Domain
   - **Type:** `HTTP`
   - **URL:** `reminder-api:3000`
5. Speichere den Hostname.

---

## 📱 App verwenden (Frontend)

1. Öffne deine GitHub-Pages-URL im Browser: `https://<dein-github-name>.github.io/VideoTagebuch/`
2. **PWA installieren:**
   - **iOS (Safari):** Teilen-Button → *Zum Home-Bildschirm*
   - **Android (Chrome):** Menü (Drei Punkte) → *App installieren* bzw. *Zum Startbildschirm hinzufügen*
3. **Server verbinden:**
   - Trage im Einstellungsbereich deine Backend-URL ein:  
     `https://deine-subdomain.duckdns.org`
   - Die URL wird lokal im Browser (`localStorage`) gespeichert. Das Frontend lädt daraufhin automatisch den aktuellen Zyklus und die erlaubten Konten.
4. **Erinnerung aktivieren:**
   - Gewünschte tägliche Uhrzeit wählen (z. B. `20:00 Uhr`).
   - Auf *Erinnerung aktivieren* klicken und die Benachrichtigungsabfrage des Browsers bestätigen.
