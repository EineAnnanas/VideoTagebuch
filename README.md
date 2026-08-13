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



