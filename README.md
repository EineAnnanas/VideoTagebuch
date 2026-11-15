# VideoTagebuch

Ein gemeinsames, rundenbasiertes Video-Tagebuch als **Progressive Web
App**. Jeder hat seinen Tag und lädt ein bis zwei Minuten hoch; nach
30 Tagen wird automatisch gelöscht.

Das Frontend ist eine einzige statische Datei auf **GitHub Pages**.
Die Videos liegen in **Google Drive** und gehen direkt vom Browser
dorthin. Ein kleines Backend auf einem **Raspberry Pi** liefert die
Konfiguration und verschickt die Erinnerungen.

> **Grafiken:** Die Dino-Sprites stammen von **Arks**.
> „You can use these for whatever you'd like, but be sure to tag my
> twitter [@ArksDigital](https://twitter.com/ArksDigital) and credit
> me properly."

---

## Wie die Rotation funktioniert

Sieben Namen plus ein Pausentag ergeben einen Zyklus von **acht**
Tagen. Weil eine Woche nur sieben hat, verschiebt sich die Zuteilung
jede Woche um einen Tag – sonst hätte jeder für immer denselben
Wochentag. Nach acht Wochen war jeder einmal überall.

Deshalb lädt pro Tag nur **eine** Person hoch. Über 30 Tage sind das
rund 26 Einsätze für die ganze Gruppe, bei 1080p etwa 7 bis 10 GB.

---

## 🔒 Datenschutz

- **Keine Klartext-Adressen auf GitHub:** Die zulässigen Projekt-Konten
  liegen nur als SHA-256-Hash vor. Weder im Repository noch im
  Netzwerkverkehr tauchen echte Adressen auf.
- **Keine Kontaktdaten für Benachrichtigungen:** Push läuft über den
  Web-Push-Standard des Browsers – anonyme kryptografische Tokens,
  keine Nummern, Namen oder Adressen.
- **Reihenfolge und Termine** liegen ausschließlich auf dem privaten
  Server, nicht im öffentlichen Code.

> Ehrlich zur Reichweite: Die Hashes sind nicht gesalzen. Wer die
> Namen der Gruppe kennt, kann die Adressen durch Ausprobieren
> zurückrechnen. Der Schutz wirkt gegen das Absammeln durch Fremde,
> nicht gegen jemanden, der gezielt rät. Für ein öffentliches Repo
> ist das trotzdem erheblich besser als Klartext.

---

## 🛠️ Voraussetzungen

- **Frontend:** GitHub Pages (kostenlos, HTTPS inklusive)
- **Google:** ein Hub-Konto, das den Drive-Ordner besitzt, plus ein
  Google-Cloud-Projekt für die Anmeldung
- **Backend:** Raspberry Pi oder Server mit Docker und Docker Compose
- **Erreichbarkeit:** ein Cloudflare-Konto für den Tunnel
  (keine Portfreigabe im Router nötig)

---

## 1. Drive vorbereiten

Im **Hub-Konto**:

1. Ordner `Videotagebuch` anlegen
2. Darin pro Person einen Unterordner, dessen Name den Vornamen
   enthält: `01-fabian`, `02-lennart`, …
3. Den **Hauptordner** mit allen Projekt-Konten teilen, Rolle
   *Bearbeiter*
4. Im Freigabe-Fenster über das Zahnrad *„Bearbeiter dürfen Zugriff
   ändern und Elemente teilen"* ausschalten

Die Ordner-ID steht in der Adresszeile:
`drive.google.com/drive/folders/`**`DAS_IST_DIE_ID`**

---

## 2. Google-Anmeldung einrichten

Alles kostenlos, keine Zahlungsdaten.

1. [console.cloud.google.com](https://console.cloud.google.com) mit dem
   Hub-Konto öffnen, neues Projekt anlegen
2. **APIs & Dienste → Bibliothek** → *Google Drive API* → **Aktivieren**
3. **Google Auth Platform → Data Access** → Bereich
   `https://www.googleapis.com/auth/drive` hinzufügen
4. **Audience** → *Publishing status: Testing*, darunter alle
   Projekt-Konten als **Test users** eintragen
5. **Clients** → *Create client* → **Webanwendung**
   - *Authorized JavaScript origins:* `https://DEINNAME.github.io`
     (nur die Domain, **ohne** Repo-Pfad)
   - *Authorized redirect URIs:* leer lassen
   - Für lokale Tests zusätzlich `http://localhost` und
     `http://localhost:8080`
6. Die **Client-ID** in `index.html` unter `CONFIG.CLIENT_ID` eintragen

> Warum Vollzugriff auf Drive: Der eingeschränkte Bereich `drive.file`
> erlaubt nur Zugriff auf Dateien, die die App selbst angelegt hat –
> dann sähe niemand die Videos der anderen.

---

## 3. Frontend veröffentlichen

1. Öffentliches Repo anlegen (Pages ist nur für öffentliche kostenlos)
2. `index.html`, `sw.js`, `manifest.webmanifest`, den Ordner `icons/`
   und die vier `dino-*.png` hochladen
3. **Settings → Pages** → *Deploy from a branch*, Branch `main`,
   Ordner `/ (root)*
4. Nach ein bis zwei Minuten läuft die Seite unter
   `https://DEINNAME.github.io/VideoTagebuch/`

---

## 4. Server aufsetzen

### 4.1 Dateien kopieren

Das Verzeichnis `server/` auf den Pi kopieren, z. B. nach
`~/tagebuch-server`:

```text
tagebuch-server/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
├── setup.js
└── .env
```

### 4.2 VAPID-Schlüssel erzeugen

Web-Push braucht ein Schlüsselpaar:

```bash
npx web-push generate-vapid-keys
```

### 4.3 Umgebungsvariablen

`env.example` nach `.env` umbenennen und ausfüllen:

```env
VAPID_PUBLIC_KEY=dein_public_key
VAPID_PRIVATE_KEY=dein_private_key
TUNNEL_TOKEN=dein_cloudflare_tunnel_token
```

### 4.4 Konfiguration anlegen

```bash
node setup.js
```

Der Assistent fragt Zyklus-Startdatum, Reihenfolge der Personen und
die erlaubten Konten ab, hasht die Adressen automatisch und legt das
Ergebnis in `data/config.json` ab – also **nicht** im Repository.

Für spätere Änderungen einfach erneut ausführen.

### 4.5 Starten

```bash
docker compose up -d
```

---

## 5. Cloudflare Tunnel

Macht den Pi erreichbar, ohne eine Portfreigabe im Router.

1. Cloudflare Dashboard → **Zero Trust → Networks → Tunnels**
2. Neuen Tunnel anlegen (Typ *Cloudflared*), Token kopieren und als
   `TUNNEL_TOKEN` in die `.env` eintragen
3. Unter **Public Hostnames** eine Route hinzufügen:
   - *Subdomain:* z. B. `tagebuch`
   - *Domain:* deine Domain
   - *Type:* `HTTP`
   - *URL:* `reminder-api:3000`

---

## 6. App benutzen

1. Seite im Browser öffnen
2. **Installieren:**
   - iOS (Safari): Teilen → *Zum Home-Bildschirm*
   - Android (Chrome): Menü → *App installieren*
3. **Server verbinden:** Zahnrad oben rechts → Backend-URL eintragen.
   Sie wird lokal im Browser gespeichert; danach lädt die Seite
   Zyklus und erlaubte Konten von dort.
4. **Erinnerung aktivieren:** Uhrzeit wählen, einschalten, die
   Browser-Abfrage bestätigen.

> Beim Start vom Home-Bildschirm behandelt iOS die Seite als eigene
> Umgebung mit eigenen Cookies. Die Google-Anmeldung aus Safari gilt
> dort **nicht** – einmal neu anmelden, danach bleibt sie.

---

## Eine Person hinzufügen

Vier Schritte:

1. **Unterordner anlegen** im geteilten Ordner, Name enthält den
   Vornamen: `03-joshua`. Die Seite ordnet über diesen Namen zu.
2. **Freigeben:** Hauptordner mit der Adresse der Person teilen,
   Rolle *Bearbeiter*.
3. **Als Testnutzer eintragen** in der Cloud Console unter
   *Google Auth Platform → Audience → Test users*.
4. **`node setup.js`** auf dem Pi erneut ausführen und den Namen in
   die Reihenfolge sowie die Adresse zu den Konten aufnehmen.

> Vergisst du Schritt 3, meldet Google „Zugriff blockiert".
> Vergisst du den Ordner, steht im Tagesfeld „noch kein Ordner
> angelegt". Vergisst du Schritt 4, ist die Person nicht dran und
> darf sich nicht anmelden.

**Warum eigene Projekt-Konten und nicht die privaten:** Private
Google-Konten sind meist randvoll – 15 GB teilen sich Gmail, Fotos
und Drive. Ein Upload in ein volles Konto scheitert. Durch die
Rotation reichen aber **drei** Konten für sieben Leute; mehrere
Personen dürfen sich eins teilen, denn wer in welchen Ordner lädt,
hängt nicht am angemeldeten Konto.

---

## Wie das Löschen funktioniert

In Drive darf nur löschen, wem eine Datei gehört. Da jeder mit seinem
Konto hochlädt, kann kein zentrales Skript aufräumen – deshalb macht
es die Seite: Beim Öffnen entfernt sie **die eigenen** Videos, die
älter als 30 Tage sind, endgültig und ohne Umweg über den Papierkorb
(der belegt weiter Speicher).

Vier Bedingungen müssen zusammenkommen: Die Datei gehört dem
angemeldeten Konto, Drive bestätigt selbst das Löschrecht, sie liegt
im Projektordner, und sie ist älter als die Aufbewahrungszeit.
Maßgeblich ist der echte Upload-Zeitpunkt, nicht das Datum im
Dateinamen – ein nachgereichtes Video verschwindet also nicht
vorzeitig.

Abschalten mit `AUTO_LOESCHEN: false`.

> Wer die Seite monatelang nicht öffnet, dessen alte Videos bleiben
> liegen. Sichtbar sind sie nicht mehr, sie belegen aber Platz.

---

## Punkte und Bestenliste

Ein Punkt pro hochgeladenem Bild oder Video, höchstens **fünf pro
Woche** (`PUNKTE_PRO_WOCHE`). Die Obergrenze verhindert, dass gewinnt,
wer sein Video in zwanzig Schnipsel zerlegt.

Unten stehen zwei Listen: **dieser Monat** und **gesamt**.

Weil die Videos nach 30 Tagen verschwinden, lässt sich „gesamt" nicht
aus Drive ausrechnen. Jede Person hat deshalb eine kleine Datei im
Hauptordner – `_punkte-fabian.json` –, in der nur Tage und Anzahl
stehen. Eine Datei **pro Person**, damit sich zwei gleichzeitige
Uploads nicht gegenseitig überschreiben. Diese Dateien sind vom
30-Tage-Löschen ausgenommen und tauchen in der Zeitleiste nicht auf.

Wer noch keine Datei hat, bekommt seinen Stand aus dem, was gerade in
Drive liegt – niemand startet bei null.

---

## Das Spiel

In der heutigen Zeile – und automatisch beim Hochladen – läuft ein
kleines Sprungspiel. Ein Leben, ein Treffer beendet die Runde, der
Bestwert bleibt im Browser.

- **Stehende Pfosten** überspringen
- **Fliegende Vierecke** unterlaufen – wer dort springt, fliegt hinein
- **Kurz tippen springt flacher** als lange halten
- Am Handy geht das Spiel auf den ganzen Bildschirm, getippt werden
  darf überall

Jede Person bekommt einen eigenen Dino; die Farbe wird aus dem Namen
abgeleitet. Eine fertige Sprunganimation gibt es in der Vorlage nicht –
sie ist aus dem Laufzyklus zusammengesetzt: Feld 5 beim Steigen
(Beine angezogen), Feld 8 beim Fallen (Bein gestreckt).

Fehlen die `dino-*.png`, zeichnet das Spiel einen schlichten Kasten
statt des Dinos – es bricht also nicht.

---

## Upload-Grenzen

In `CONFIG.GRENZEN` stehen Höchstwerte für Auflösung, Länge,
Dateigröße und Tagesmenge. Der Hauptschalter `GRENZEN_AKTIV` steht
standardmäßig auf `false`.

Auflösung und Länge werden trotzdem angezeigt, man sieht also, wenn
jemand in 4K filmt. **Das ist der größte Hebel überhaupt:** 2 Minuten
in 4K sind rund 350 MB, in 1080p rund 70 MB – fünfmal schneller
hochgeladen, fünfmal weniger Speicher.

---

## Wenn etwas nicht geht

**„Zugriff blockiert"**
Das Konto steht nicht in der Testnutzer-Liste.

**„origin_mismatch"**
Die Adresse unter *Authorized JavaScript origins* stimmt nicht exakt.
Kein Schrägstrich am Ende, kein Pfad, `https` statt `http`.

**Änderungen kommen nicht an**
Der Service Worker liefert `index.html` aus dem Speicher. Nach einem
Update die Versionsnummer in `sw.js` erhöhen – oder die App vom
Home-Bildschirm löschen und neu hinzufügen.

**Tagesfeld sagt „noch kein Ordner angelegt"**
Der Unterordner fehlt oder sein Name enthält den Vornamen nicht.

**Upload bricht ab**
Die Seite nimmt von selbst wieder auf – es wird nur der fehlende Rest
geschickt, bis zu fünf Versuche. Bleibt es dabei, ist meist der
Speicher des Kontos voll; das steht dann oben rechts.

**Seite zeigt nichts, Server ist aus**
Dann greift die Notfall-Konfiguration im Frontend. Fehlt sie, bleibt
die Reihenfolge leer.

---

## Was die Seite bewusst nicht kann

- **Fremde Videos löschen** – von Drive verhindert, und gut so.
- **Videos kürzen oder zusammenfügen** – das bräuchte ffmpeg im
  Browser: 30 MB Download und mehrere Minuten Rechnen auf dem Handy.
  Kürzen geht in der Handy-Galerie vor dem Hochladen.
