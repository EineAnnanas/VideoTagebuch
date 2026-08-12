# Videotagebuch – Website einrichten

Eine statische Seite auf GitHub Pages, die den geteilten Drive-Ordner
ausliest. Kein Server, keine Geheimnisse im Code, keine Kosten.

Reihenfolge ist wichtig: Google will beim Anlegen der Kennung wissen,
unter welcher Adresse die Seite läuft. Deshalb zuerst GitHub.

---

## 1. Repo und Pages

- [ ] Neues **öffentliches** Repo anlegen, z.B. `videotagebuch`
      (Pages gibt es kostenlos nur für öffentliche Repos)
- [ ] `index.html` und diese `README.md` hochladen
- [ ] Settings → Pages → Source: **Deploy from a branch**,
      Branch `main`, Ordner `/ (root)` → Save
- [ ] Ein bis zwei Minuten warten, dann steht oben die Adresse:
      `https://DEINNAME.github.io/videotagebuch/`

Die Seite zeigt jetzt eine Fehlermeldung, dass die CLIENT_ID fehlt.
Das ist richtig so.

**Notiere dir die Adresse ohne Repo-Teil**, also nur
`https://DEINNAME.github.io` – die braucht Google gleich.

---

## 2. Google-Cloud-Projekt

Alles kostenlos, keine Zahlungsdaten.

- [ ] [console.cloud.google.com](https://console.cloud.google.com) öffnen –
      **mit dem Hub-Konto `speicherplatzfurvlogs` anmelden**
- [ ] Oben links neues Projekt anlegen, Name z.B. `videotagebuch`
- [ ] Im Menü **APIs & Dienste → Bibliothek** → nach *Google Drive API*
      suchen → **Aktivieren**

### Zustimmungsbildschirm

- [ ] **APIs & Dienste → OAuth-Zustimmungsbildschirm**
- [ ] Nutzertyp: **Extern** → Erstellen
- [ ] App-Name: `Videotagebuch`
- [ ] Support-E-Mail und Entwickler-E-Mail: dein Hub-Konto
- [ ] Speichern und fortfahren
- [ ] **Bereiche** → *Bereiche hinzufügen* → suchen nach
      `drive.readonly` → auswählen → aktualisieren → speichern
- [ ] **Testnutzer** → hinzufügen:
      - `speicherplatzfurvlogs@gmail.com`
      - `auskunftgesucht@gmail.com`
      - (später jedes weitere Projekt-Konto)

> Ohne Eintrag als Testnutzer bekommt ein Konto beim Anmelden die
> Meldung „Zugriff blockiert". Das ist die häufigste Stolperfalle.
> Die App bleibt im Testmodus – bis 100 Nutzer völlig ausreichend
> und erspart die Google-Verifizierung.

### Anmeldedaten

- [ ] **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen →
      OAuth-Client-ID**
- [ ] Anwendungstyp: **Webanwendung**
- [ ] Unter **Autorisierte JavaScript-Quellen** hinzufügen:
      ```
      https://DEINNAME.github.io
      ```
- [ ] **Wichtig:** nur die Domain, ohne `/videotagebuch/` am Ende.
      Google akzeptiert hier keine Pfade
- [ ] *Autorisierte Weiterleitungs-URIs* bleibt **leer**
- [ ] Erstellen → die **Client-ID** kopieren
      (endet auf `.apps.googleusercontent.com`)

---

## 3. Client-ID eintragen

In `index.html` ganz oben im Abschnitt `CONFIG`:

```js
CLIENT_ID: '1234567890-abc....apps.googleusercontent.com',
```

Speichern, committen. Nach etwa einer Minute ist die Änderung live.

---

## 4. Ausprobieren

- [ ] Seite öffnen → **Mit Google anmelden**
- [ ] Konto wählen: `auskunftgesucht`
- [ ] Warnung „Google hat diese App nicht überprüft" →
      **Erweitert → Weiter zu Videotagebuch (unsicher)**
      (dein eigenes Projekt, siehe Entwickler-Adresse)
- [ ] Zugriff **Zulassen**

Danach solltest du die Videos nach Tagen gruppiert sehen.

---

## Wenn etwas nicht geht

**„Zugriff blockiert: … hat den Zugriff nicht abgeschlossen"**
Das Konto steht nicht in der Testnutzer-Liste. Nachtragen, dann geht es.

**„origin_mismatch" oder „redirect_uri_mismatch"**
Die Adresse unter *Autorisierte JavaScript-Quellen* stimmt nicht exakt.
Kein Schrägstrich am Ende, kein Pfad, `https` statt `http`.
Änderungen dort brauchen manchmal ein paar Minuten.

**Seite bleibt bei „Lade …"**
Konsole öffnen (F12). Meist fehlt die aktivierte Drive API aus Schritt 2.

**Videos laden langsam**
Die Seite holt die Datei komplett, bevor sie abspielt – bei 100 MB
dauert das ein paar Sekunden. Der Prozentwert zeigt den Fortschritt.
Wer in 1080p statt 4K aufnimmt, wartet ein Fünftel so lang.

---

## Was die Seite bewusst nicht kann

- **Nichts hochladen.** Kommt in der nächsten Ausbaustufe.
- **Nichts löschen.** Der Zugriff ist ausdrücklich nur lesend.
  Aufgeräumt wird weiterhin vom Apps Script in jedem Konto.
