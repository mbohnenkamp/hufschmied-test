# Hufschmied – Testversion

Testversion einer Software für Hufschmiede: Rechnungen als PDF mit eingebetteter E-Rechnung (ZUGFeRD, Profil EN 16931), Kundenverwaltung und Kassenbuch. Sie läuft komplett im Browser.

**Nur zum Ausprobieren. Keine echten Kundendaten eingeben.** Der Betrieb heißt „Max Mustermann“, alle Beispieldaten sind erfunden.

## Wo liegen die Daten?

- Nur im Browser auf dem eigenen Gerät (IndexedDB), verschlüsselt mit dem Passwort (AES-GCM, Schlüssel per PBKDF2).
- Nichts wird an einen Server geschickt. Auf GitHub liegt nur der Programmcode.
- Löscht der Browser seine Website-Daten, sind die Daten weg. Deshalb in den Einstellungen regelmäßig eine Sicherung erzeugen.

## Funktionen

- Passwort beim ersten Start, änderbar, zurücksetzbar mit Wiederherstellungscode
- Rechnung schreiben, Kunde wird gespeichert und wiedergefunden
- PDF/A-3 mit eingebetteter `factur-x.xml`, öffnen, drucken, herunterladen, teilen
- Zahlart Bar, Überweisung oder PayPal; Stornorechnung statt Änderung
- Kassenbuch ohne Ändern und Löschen, Storno bleibt sichtbar und zählt nicht mit
- Monatsabschluss als PDF und Excel
- Verschlüsselte Sicherungsdatei, drei Designs

## Entwicklung

```bash
npm install
npm test
python3 -m http.server 5178
```

Die Rechenregeln stehen in `js/rechnen.js` und sind in `test/` mit nachgerechneten Beispielen geprüft. Die erzeugten Rechnungen wurden mit dem Mustang-Validator geprüft.

## Fremde Bestandteile

In `vendor/`: pdf-lib (MIT), @pdf-lib/fontkit (MIT), SheetJS (Apache-2.0), DejaVu Sans (freie Lizenz, siehe `vendor/DejaVu-LICENSE.txt`), sRGB-Profil aus Compact-ICC-Profiles (CC0).
