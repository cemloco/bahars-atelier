BAHAR’S ATELIER – PERSONAL WARDROBE
===================================
Version 1.0 (ohne KI)

FUNKTIONEN
- Digitaler Kleiderschrank: Fotoaufnahme/Galerie, Kategorie, Farbe, Saison, Favoriten, Suche
- Hintergrundbearbeitung: einfarbigen Hintergrund per Algorithmus entfernen oder manuell radieren; kein KI-Dienst
- Outfit-Studio: Stilfigur oder freie Collage, Teile verschieben, verkleinern/vergrößern, drehen, kopieren, nach vorn/hinten legen
- Looks: speichern, wieder öffnen, aktualisieren, favorisieren, löschen und als PNG exportieren
- Kalender: gespeicherten Look einem Datum zuordnen
- Backup: JSON-Sicherung exportieren und wiederherstellen
- Offline-fähig nach erfolgreichem ersten Laden über HTTPS (Service Worker)

VERÖFFENTLICHEN ALS IPHONE-WEB-APP
1. Alle Dateien dieses ZIPs zusammen entpacken.
2. Den gesamten Ordnerinhalt (index.html, app.js, styles.css, sw.js, manifest.webmanifest, zwei PNG-Icons) bei einem statischen HTTPS-Host veröffentlichen, etwa Netlify, Cloudflare Pages oder GitHub Pages.
   Wichtig: Die Dateien müssen alle im selben Web-Verzeichnis liegen.
3. Die HTTPS-Adresse im Safari-Browser des iPhones öffnen.
4. In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen.
5. Die App startet danach mit ihrem BA-Icon wie eine eigenständige Anwendung.

EINE-WICHTIGE-EINSCHRÄNKUNG
- Diese Version speichert ausschließlich im lokalen Browser-Speicher (IndexedDB) des jeweiligen Geräts und der Domain.
- Sie hat keine Anmeldung und keine Synchronisierung zwischen mehreren Geräten.
- Die Bilder werden zur Bearbeitung nicht an einen Server oder KI-Dienst gesendet.
- Vor dem Löschen von Browserdaten, einem Domainwechsel oder Gerätewechsel immer über das Zahnrad-Symbol „Komplette Sicherung herunterladen“ verwenden.
- Die automatische Hintergrundentfernung funktioniert nur bei relativ einfarbigen Hintergründen. Für komplexe Fotos gibt es den manuellen Radierer.
- Die Stilfigur ist keine passgenaue virtuelle Anprobe.

DATEIEN
index.html          – App-Oberfläche
styles.css          – Responsive Gestaltung
app.js              – Alle Funktionen
manifest.webmanifest – PWA-Metadaten
sw.js               – Offline-Cache
icon-192.png        – App-Icon (192px)
icon-512.png        – App-Icon (512px)
