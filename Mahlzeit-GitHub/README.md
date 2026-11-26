# Mahlzeit

Deutschsprachiges Ernährungstagebuch mit Tageszielen, Kalender, Lebensmittelerfassung und wiederverwendbaren Mahlzeitenvorlagen.

## Auf GitHub hochladen

1. Entpacke das ZIP.
2. Erstelle auf GitHub ein Repository, z. B. `mahlzeit`.
3. Öffne im Repository **Add file → Upload files** und ziehe den **Inhalt** des entpackten Ordners hinein. Die Datei `README.md` und die Ordner `public` und `docs` gehören ins Stammverzeichnis. Klicke auf **Commit changes**.

### Auf GitHub Pages am Handy öffnen

1. Gehe im Repository zu **Settings → Pages**.
2. Wähle unter **Build and deployment** zuerst **Deploy from a branch**. Wähle dann `main` und `/docs`. Klicke auf **Save**.
3. Öffne die unter **Pages** angezeigte HTTPS-Adresse auf dem Handy. In Safari kannst du sie über **Teilen → Zum Home-Bildschirm** hinzufügen.

[Offizielle Anleitung zu GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

GitHub Pages stellt die statische App bereit. Tagebuch, lokale Richtwerte, eigene Korrekturen und Vorlagen funktionieren dort. Für die serverseitige Produktsuche und NanoGPT brauchst du den unten beschriebenen Server. Einträge bleiben im jeweiligen Browserprofil und werden zwischen verschiedenen App-Adressen oder Geräten nicht synchronisiert.

Nach Änderungen an `public/` aktualisierst du `docs/` mit `node build-pages.mjs` und übernimmst beide Ordner in denselben Commit.

## Vollständige App mit Server starten

Voraussetzung ist Node.js 24. Unter Windows kannst du `Mahlzeit-starten.cmd` öffnen. Alternativ starte im Projektordner:

```sh
node --env-file-if-exists=.env dev.mjs
```

Rufe dann [localhost:4173](http://127.0.0.1:4173) auf. Die App benötigt keine npm-Abhängigkeiten. Die serverseitige Produktsuche nutzt Open Food Facts.

### NanoGPT einrichten

Kopiere `.env.example` als `.env`. Trage deinen Schlüssel in `NANOGPT_API_KEY` ein und starte den Server neu. Beim Hosting gehört der Schlüssel in die geheimen Umgebungsvariablen. `.env` und API-Schlüssel gehören nicht in GitHub. `NANOGPT_ENDPOINT` (vollständige Chat-Completions-URL) und `NANOGPT_MODEL` sind optional.

`node build.mjs` baut zusätzlich einen Cloudflare-kompatiblen Worker. Betreibe eine Web-Version mit NanoGPT-Schlüssel hinter einer Zugriffsbeschränkung, damit nur berechtigte Nutzer API-Guthaben verwenden können.
