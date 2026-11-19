import * as speicher from './speicher.js';
import { euroZuCent, centZuText, rechnungsSummen, naechsteNummer, heute, datumDeutsch, tagePlus, kassenMonat, kassenBestand, zeilenNetto, statusArt, betraege, summeBetraege, monatsSummen } from './rechnen.js';
import { ZAHLARTEN, EINHEITEN, kundenName } from './zugferd.js';
import { rechnungPdf, kassenbuchPdf, rechnungsDateiname, monatsName } from './pdf.js';
import { startDaten, beispielDaten } from './vorlagen.js';

const app = document.getElementById('app');
const dialog = document.getElementById('dialog');
const SPERRE_NACH_MINUTEN = 15;

let daten = null;
let entwurf = null;
let kundenSuche = '';
let kasseMonat = heute().slice(0, 7);
let bearbeiteterKunde = null;
let letzteAktivitaet = Date.now();
let dateien = {};
let rechnungsFilter = { suche: '', monat: '', status: '', zahlart: '' };

const h = (t) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const euro = (cent) => `${centZuText(cent)} €`;
const neueId = () => crypto.randomUUID();
const sichern = () => speicher.speichern(daten);
const formWerte = (form) => Object.fromEntries(new FormData(form));

// ---------- Dialoge ----------

function frage(text, { eingabe = null, ja = 'OK', nein = 'Abbrechen' } = {}) {
  return new Promise((fertig) => {
    dialog.innerHTML = `<form method="dialog"><p>${h(text)}</p>
      ${eingabe ? `<label>${h(eingabe)}<input name="wert" required /></label>` : ''}
      <div class="leiste"><button class="haupt" value="ja">${h(ja)}</button>${nein ? `<button value="nein" formnovalidate>${h(nein)}</button>` : ''}</div></form>`;
    dialog.onclose = () => {
      const ok = dialog.returnValue === 'ja';
      fertig(eingabe ? (ok ? dialog.querySelector('input').value.trim() : null) : ok);
    };
    dialog.returnValue = '';
    dialog.showModal();
  });
}

const meldung = (text) => frage(text, { nein: null });

// ---------- Dateien ausgeben ----------

let pdfBibliothek = null;
async function lib() {
  if (!pdfBibliothek) {
    const [schrift, schriftFett, icc] = await Promise.all(
      ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'sRGB-v2-micro.icc'].map((n) =>
        fetch(`vendor/${n}`)
          .then((r) => r.arrayBuffer())
          .then((b) => new Uint8Array(b)),
      ),
    );
    pdfBibliothek = { PDFLib: window.PDFLib, fontkit: window.fontkit, schrift, schriftFett, icc };
  }
  return pdfBibliothek;
}

// Die Datei wird vorab erzeugt, damit Öffnen und Teilen direkt beim Tippen funktionieren (sonst blockt der Browser).
function dateiBereit(schluessel, bytes, name, typ) {
  if (dateien[schluessel]) URL.revokeObjectURL(dateien[schluessel].url);
  const datei = new File([bytes], name, { type: typ });
  dateien[schluessel] = { datei, url: URL.createObjectURL(datei) };
  return dateien[schluessel];
}

function dateiKnoepfe(schluessel, { oeffnen = true } = {}) {
  const d = dateien[schluessel];
  if (!d) return '<span class="klein">Datei wird erzeugt …</span>';
  const teilbar = navigator.canShare && navigator.canShare({ files: [d.datei] });
  return `${oeffnen ? `<a class="knopf haupt" href="${d.url}" target="_blank" rel="noopener">Öffnen / Drucken</a>` : ''}
    <a class="knopf" href="${d.url}" download="${h(d.datei.name)}">Herunterladen</a>
    ${teilbar ? `<button data-aktion="teilen" data-datei="${schluessel}">Teilen / per Mail senden</button>` : ''}`;
}

// ---------- Rahmen ----------

const SEITEN = [
  ['start', 'Start'],
  ['rechnungen', 'Rechnungen'],
  ['kunden', 'Kunden'],
  ['kasse', 'Kassenbuch'],
  ['einstellungen', 'Einstellungen'],
];

function rahmen(seite, inhalt) {
  const tageSeitSicherung = daten.letzteSicherung ? Math.floor((Date.now() - new Date(daten.letzteSicherung)) / 86400000) : null;
  const sicherungFaellig = (daten.kunden.length || daten.rechnungen.length || daten.kasse.length) && (tageSeitSicherung === null || tageSeitSicherung >= 7);
  return `<header class="kopf nicht-drucken">
      <span class="name">${h(daten.betrieb.name)}</span>
      <nav>${SEITEN.map(([id, name]) => `<a href="#${id}" class="${seite === id ? 'aktiv' : ''}">${name}</a>`).join('')}</nav>
      <button data-aktion="sperren">Sperren</button>
    </header>
    <div class="hinweis">Testversion. Alle Daten liegen verschlüsselt nur in diesem Browser auf diesem Gerät.</div>
    ${sicherungFaellig ? `<div class="hinweis warnung">${tageSeitSicherung === null ? 'Es gibt noch keine Sicherung.' : `Die letzte Sicherung ist ${tageSeitSicherung} Tage alt.`} <a href="#einstellungen">Jetzt sichern</a></div>` : ''}
    <main>${inhalt}</main>`;
}

// ---------- Anmeldung ----------

function zeigeEinrichten() {
  app.innerHTML = `<main class="schmal"><div class="karte">
    <h1>Hufschmied – Testversion</h1>
    <p>Lege ein Passwort fest. Damit werden deine Daten auf diesem Gerät verschlüsselt.</p>
    <form data-form="einrichten">
      <label>Passwort (mindestens 8 Zeichen)<input type="password" name="p1" minlength="8" required autocomplete="new-password" /></label>
      <label>Passwort wiederholen<input type="password" name="p2" minlength="8" required autocomplete="new-password" /></label>
      <p class="fehler" id="fehler"></p>
      <button class="haupt">Passwort festlegen</button>
    </form>
    <p class="klein" style="margin-top:14px">Du hast schon eine Sicherungsdatei? <button class="link" data-aktion="sicherungWaehlen">Sicherung einspielen</button></p>
    <input type="file" id="sicherungsdatei" accept=".json,application/json" hidden />
  </div></main>`;
}

function zeigeCode(code, weiter) {
  app.innerHTML = `<main class="schmal"><div class="karte">
    <h1>Wiederherstellungscode</h1>
    <p>Mit diesem Code kannst du ein neues Passwort setzen, falls du deines vergisst. Er wird nur jetzt angezeigt. Drucke ihn aus oder schreibe ihn ab und bewahre ihn getrennt vom Gerät auf.</p>
    <div class="code">${h(code)}</div>
    <p class="klein">Ohne Passwort und ohne diesen Code kommt niemand mehr an die Daten, auch wir nicht.</p>
    <div class="leiste nicht-drucken"><button data-aktion="drucken">Drucken</button></div>
    <label class="haken nicht-drucken"><input type="checkbox" id="notiert" />Ich habe den Code notiert</label>
    <button class="haupt nicht-drucken" data-aktion="codeWeiter">Weiter</button>
  </div></main>`;
  aktionen.codeWeiter = async () => {
    if (!document.getElementById('notiert').checked) return meldung('Bitte bestätige, dass du den Code notiert hast.');
    weiter();
  };
}

function zeigeAnmeldung() {
  app.innerHTML = `<main class="schmal"><div class="karte">
    <h1>Hufschmied – Testversion</h1>
    <form data-form="anmelden">
      <label>Passwort<input type="password" name="passwort" required autocomplete="current-password" autofocus /></label>
      <p class="fehler" id="fehler"></p>
      <button class="haupt">Entsperren</button>
    </form>
    <p class="klein" style="margin-top:14px"><button class="link" data-aktion="vergessen">Passwort vergessen?</button></p>
  </div></main>`;
}

function zeigeVergessen() {
  app.innerHTML = `<main class="schmal"><div class="karte">
    <h1>Passwort zurücksetzen</h1>
    <form data-form="zuruecksetzen">
      <label>Wiederherstellungscode<input name="code" required autocomplete="off" autocapitalize="characters" /></label>
      <label>Neues Passwort (mindestens 8 Zeichen)<input type="password" name="p1" minlength="8" required autocomplete="new-password" /></label>
      <label>Neues Passwort wiederholen<input type="password" name="p2" minlength="8" required autocomplete="new-password" /></label>
      <p class="fehler" id="fehler"></p>
      <div class="leiste"><button class="haupt">Neues Passwort setzen</button><button type="button" data-aktion="zurAnmeldung">Zurück</button></div>
    </form>
  </div></main>`;
}

function nachAnmeldung(geladen) {
  daten = geladen;
  document.documentElement.dataset.design = daten.design;
  letzteAktivitaet = Date.now();
  if (!location.hash) location.hash = '#start';
  zeige();
}

// ---------- Seiten ----------

function rechnungStatus(r) {
  if (r.typ === 'storno') return ['', 'Stornorechnung'];
  if (r.storniertDurch) return ['', `storniert (${r.storniertDurch})`];
  if (r.bezahlt) return ['bezahlt', `bezahlt · ${ZAHLARTEN[r.zahlart].text}`];
  if (r.eingang) return ['bezahlt', `bezahlt am ${datumDeutsch(r.eingang.datum)} · ${ZAHLARTEN[r.eingang.zahlart].text}`];
  return ['offen', `offen · fällig ${datumDeutsch(r.faelligAm)}`];
}

const offeneRechnungen = () => daten.rechnungen.filter((r) => rechnungStatus(r)[0] === 'offen');

function rechnungsTabelle(liste) {
  if (!liste.length) return '<p class="klein">Noch keine Rechnungen.</p>';
  return `<div class="tabelle-rahmen"><table><tr><th>Nr.</th><th>Datum</th><th>Kunde</th><th class="betrag">Betrag</th><th>Status</th></tr>
    ${liste
      .map((r) => {
        const [art, text] = rechnungStatus(r);
        const brutto = rechnungsSummen(r.positionen).brutto * (r.typ === 'storno' ? -1 : 1);
        return `<tr class="klickbar" data-aktion="gehe" data-ziel="#rechnung/${h(r.nr)}"><td>${h(r.nr)}</td><td>${datumDeutsch(r.datum)}</td><td>${h(kundenName(r.kunde))}</td><td class="betrag">${euro(brutto)}</td><td><span class="marke ${art}">${h(text)}</span></td></tr>`;
      })
      .join('')}</table></div>`;
}

function seiteStart() {
  const offen = offeneRechnungen();
  const summeOffen = offen.reduce((s, r) => s + rechnungsSummen(r.positionen).brutto, 0);
  return `<h1>Guten Tag</h1>
    <div class="kacheln">
      <a class="kachel haupt" href="#rechnung-neu"><b>Neue Rechnung</b><span class="klein">schreiben und versenden</span></a>
      <a class="kachel" href="#kunden"><b>Kunden</b><span class="klein">${daten.kunden.length} gespeichert</span></a>
      <a class="kachel" href="#kasse"><b>Kassenbuch</b><span class="klein">Bestand ${euro(kassenBestand(daten.kasse))}</span></a>
    </div>
    <div class="kacheln">
      <div class="karte"><span class="klein">Offene Rechnungen</span><div class="zahl">${offen.length}</div><span class="klein">${euro(summeOffen)}</span></div>
      <div class="karte"><span class="klein">Rechnungen gesamt</span><div class="zahl">${daten.rechnungen.length}</div></div>
    </div>
    <div class="karte"><h2>Letzte Rechnungen</h2>${rechnungsTabelle([...daten.rechnungen].reverse().slice(0, 5))}</div>`;
}

const STATUS_NAMEN = { offen: 'Offen', bezahlt: 'Bezahlt', storniert: 'Storniert', storno: 'Stornorechnung' };
// Bei nachträglich bezahlten Rechnungen zählt die Zahlart des Zahlungseingangs.
const zahlartVon = (r) => (r.eingang || r).zahlart;

function gefilterteRechnungen() {
  const f = rechnungsFilter;
  const suche = f.suche.trim().toLowerCase();
  return daten.rechnungen
    .filter((r) => !suche || `${r.nr} ${r.kunde.firma} ${r.kunde.name} ${r.kunde.ort}`.toLowerCase().includes(suche))
    .filter((r) => !f.monat || r.datum.slice(0, 7) === f.monat)
    .filter((r) => !f.status || statusArt(r) === f.status)
    .filter((r) => !f.zahlart || zahlartVon(r) === f.zahlart)
    .reverse();
}

function rechnungsErgebnis() {
  const liste = gefilterteRechnungen();
  const s = summeBetraege(liste);
  return `<p class="klein">${liste.length} von ${daten.rechnungen.length} Rechnungen</p>
    ${rechnungsTabelle(liste)}
    ${liste.length ? `<table class="summen"><tr><td>Summe netto</td><td>${euro(s.netto)}</td></tr><tr><td>Umsatzsteuer 19 %</td><td>${euro(s.ust)}</td></tr><tr><td><b>Summe brutto</b></td><td><b>${euro(s.brutto)}</b></td></tr><tr><td>davon offen</td><td>${euro(s.offen)}</td></tr></table>` : ''}`;
}

function seiteRechnungen() {
  const f = rechnungsFilter;
  const monate = monatsSummen(daten.rechnungen);
  const auswahl = (id, name, optionen, wert) =>
    `<label>${name}<select id="${id}" data-filter="${id.slice(8)}"><option value="">Alle</option>${optionen.map(([v, t]) => `<option value="${v}" ${wert === v ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></label>`;
  return `<div class="leiste"><h1 style="margin:0">Rechnungen</h1><a class="knopf haupt platz" href="#rechnung-neu">Neue Rechnung</a></div>
    <div class="karte">
      <div class="raster">
        <label>Suchen<input id="rfilter-suche" data-filter="suche" value="${h(f.suche)}" placeholder="Nummer, Kunde oder Ort" autocomplete="off" /></label>
        ${auswahl('rfilter-monat', 'Monat', monate.map((m) => [m.monat, monatsName(m.monat)]), f.monat)}
        ${auswahl('rfilter-status', 'Status', Object.entries(STATUS_NAMEN), f.status)}
        ${auswahl('rfilter-zahlart', 'Zahlart', Object.entries(ZAHLARTEN).map(([id, z]) => [id, z.text]), f.zahlart)}
      </div>
      <div class="leiste"><button data-aktion="filterLeeren">Filter zurücksetzen</button><button class="haupt platz" data-aktion="rechnungenExport">Excel erzeugen</button></div>
      <div class="leiste" id="rechnungenexport"></div>
      <div id="rechnungsergebnis">${rechnungsErgebnis()}</div>
    </div>
    <div class="karte"><h2>Monatssummen</h2>
      <p class="klein">Alle Rechnungen nach Rechnungsdatum, unabhängig vom Filter. Stornorechnungen zählen negativ und heben die stornierte Rechnung auf.</p>
      ${
        monate.length
          ? `<div class="tabelle-rahmen"><table><tr><th>Monat</th><th class="betrag">Anzahl</th><th class="betrag">Netto</th><th class="betrag">Umsatzsteuer</th><th class="betrag">Brutto</th><th class="betrag">davon offen</th></tr>
        ${monate.map((m) => `<tr><td>${h(monatsName(m.monat))}</td><td class="betrag">${m.anzahl}</td><td class="betrag">${euro(m.netto)}</td><td class="betrag">${euro(m.ust)}</td><td class="betrag">${euro(m.brutto)}</td><td class="betrag">${euro(m.offen)}</td></tr>`).join('')}</table></div>`
          : '<p class="klein">Noch keine Rechnungen.</p>'
      }
    </div>`;
}

function leererEntwurf() {
  return {
    kundeId: null,
    kunde: { firma: '', name: '', strasse: '', plz: '', ort: '', email: '' },
    datum: heute(),
    leistungsdatum: heute(),
    positionen: [{ bezeichnung: '', menge: '1', einheit: 'C62', preis: '' }],
    zahlart: 'bar',
    bezahlt: true,
    hinweis: '',
  };
}

function entwurfSummen() {
  const positionen = entwurf.positionen
    .map((p) => ({ menge: Number(String(p.menge).replace(',', '.')), einzelpreisCent: euroZuCent(p.preis) }))
    .filter((p) => Number.isFinite(p.menge) && p.einzelpreisCent !== null);
  return rechnungsSummen(positionen);
}

function summenHtml() {
  const s = entwurfSummen();
  return `<table class="summen"><tr><td>Summe netto</td><td>${euro(s.netto)}</td></tr><tr><td>Umsatzsteuer 19 %</td><td>${euro(s.ust)}</td></tr><tr><td><b>Rechnungsbetrag</b></td><td><b>${euro(s.brutto)}</b></td></tr></table>`;
}

function seiteRechnungNeu() {
  if (!entwurf) entwurf = leererEntwurf();
  const k = entwurf.kunde;
  return `<h1>Neue Rechnung</h1>
    <form data-form="rechnung" novalidate>
    <div class="karte">
      <h2>Kunde</h2>
      <label>Gespeicherten Kunden suchen<input id="kundensuche" placeholder="Name, Firma oder Ort" autocomplete="off" /></label>
      <div class="vorschlaege" id="vorschlaege"></div>
      ${entwurf.kundeId ? '<p class="klein">Gespeicherter Kunde. Änderungen an der Adresse werden beim Ausstellen übernommen. <button type="button" class="link" data-aktion="kundeLoesen">Anderer Kunde</button></p>' : '<p class="klein">Ein neuer Kunde wird beim Ausstellen automatisch gespeichert.</p>'}
      <div class="raster">
        <label>Firma / Stall (optional)<input name="firma" value="${h(k.firma)}" /></label>
        <label>Name<input name="name" value="${h(k.name)}" /></label>
        <label>Straße und Hausnummer<input name="strasse" value="${h(k.strasse)}" /></label>
        <label>PLZ<input name="plz" value="${h(k.plz)}" inputmode="numeric" /></label>
        <label>Ort<input name="ort" value="${h(k.ort)}" /></label>
        <label>E-Mail (optional)<input name="email" type="email" value="${h(k.email)}" /></label>
      </div>
    </div>
    <div class="karte">
      <h2>Leistungen</h2>
      <label>Aus der Preisliste hinzufügen<select id="preisliste"><option value="">Bitte wählen …</option>${daten.leistungen.map((l) => `<option value="${l.id}">${h(l.bezeichnung)} · ${euro(l.einzelpreisCent)} netto</option>`).join('')}</select></label>
      ${entwurf.positionen
        .map(
          (p, i) => `<div class="position">
        <label>Leistung<input name="bezeichnung-${i}" value="${h(p.bezeichnung)}" /></label>
        <label>Menge<input name="menge-${i}" value="${h(p.menge)}" inputmode="decimal" /></label>
        <label>Einheit<select name="einheit-${i}">${Object.entries(EINHEITEN).map(([code, name]) => `<option value="${code}" ${p.einheit === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
        <label>Einzelpreis netto €<input name="preis-${i}" value="${h(p.preis)}" inputmode="decimal" /></label>
        <label>&nbsp;<button type="button" data-aktion="positionWeg" data-index="${i}" aria-label="Position entfernen">Entfernen</button></label>
      </div>`,
        )
        .join('')}
      <div class="leiste"><button type="button" data-aktion="positionDazu">Weitere Position</button></div>
      <div id="summen">${summenHtml()}</div>
    </div>
    <div class="karte">
      <h2>Datum und Zahlung</h2>
      <div class="raster">
        <label>Rechnungsdatum<input type="date" name="datum" value="${entwurf.datum}" /></label>
        <label>Leistungsdatum<input type="date" name="leistungsdatum" value="${entwurf.leistungsdatum}" /></label>
        <label>Zahlart<select name="zahlart">${Object.entries(ZAHLARTEN).map(([id, z]) => `<option value="${id}" ${entwurf.zahlart === id ? 'selected' : ''}>${z.text}</option>`).join('')}</select></label>
      </div>
      <label class="haken"><input type="checkbox" name="bezahlt" ${entwurf.bezahlt ? 'checked' : ''} />Betrag ist schon bezahlt</label>
      <p class="klein">Nicht bezahlt: Zahlungsziel ${daten.betrieb.zahlungszielTage} Tage. Bar bezahlt: Die Einnahme wird automatisch ins Kassenbuch gebucht.</p>
      <label>Hinweis auf der Rechnung (optional)<textarea name="hinweis" rows="2">${h(entwurf.hinweis)}</textarea></label>
    </div>
    <p class="fehler" id="fehler"></p>
    <div class="leiste"><button class="haupt">Rechnung ausstellen</button><button type="button" data-aktion="entwurfVerwerfen">Verwerfen</button></div>
    <p class="klein">Eine ausgestellte Rechnung kann nicht mehr geändert, nur noch storniert werden.</p>
    </form>`;
}

function entwurfLesen() {
  const form = app.querySelector('[data-form="rechnung"]');
  if (!form) return;
  const w = formWerte(form);
  entwurf.kunde = { firma: w.firma.trim(), name: w.name.trim(), strasse: w.strasse.trim(), plz: w.plz.trim(), ort: w.ort.trim(), email: w.email.trim() };
  entwurf.positionen = entwurf.positionen.map((_, i) => ({ bezeichnung: w[`bezeichnung-${i}`].trim(), menge: w[`menge-${i}`], einheit: w[`einheit-${i}`], preis: w[`preis-${i}`] }));
  Object.assign(entwurf, { datum: w.datum, leistungsdatum: w.leistungsdatum, zahlart: w.zahlart, bezahlt: w.bezahlt === 'on', hinweis: w.hinweis.trim() });
}

function kundenTreffer(suche) {
  const s = suche.trim().toLowerCase();
  if (!s) return [];
  return daten.kunden.filter((k) => `${k.firma} ${k.name} ${k.ort} ${k.strasse}`.toLowerCase().includes(s));
}

// Sagt auf der Rechnung, ob und warum sie im Kassenbuch steht. Dort landet nur Bargeld.
function kassenHinweis(r) {
  if (r.typ === 'storno') return 'Stornorechnungen werden nicht automatisch ins Kassenbuch gebucht.';
  const eintrag = daten.kasse.find((e) => e.rechnungNr === r.nr);
  if (eintrag) return `Kassenbuch: gebucht als Eintrag Nr. ${eintrag.nr} am ${datumDeutsch(eintrag.datum)}${eintrag.storniert ? ' (storniert)' : ''}.`;
  if (!r.bezahlt && !r.eingang) return 'Kassenbuch: kein Eintrag, die Rechnung ist noch offen.';
  return `Kassenbuch: kein Eintrag, weil per ${ZAHLARTEN[(r.eingang || r).zahlart].text} bezahlt wurde. Ins Kassenbuch kommt nur Bargeld.`;
}

function seiteRechnung(nr) {
  const r = daten.rechnungen.find((x) => x.nr === nr);
  if (!r) return '<p>Diese Rechnung gibt es nicht.</p>';
  const s = rechnungsSummen(r.positionen);
  const [art, status] = rechnungStatus(r);
  const vz = r.typ === 'storno' ? -1 : 1;
  const schluessel = `rechnung-${r.nr}`;
  if (!dateien[schluessel]) {
    lib()
      .then((l) => rechnungPdf(l, r, daten.betrieb))
      .then((bytes) => {
        dateiBereit(schluessel, bytes, rechnungsDateiname(r), 'application/pdf');
        const ziel = document.getElementById('pdfknoepfe');
        if (ziel && location.hash === `#rechnung/${r.nr}`) ziel.innerHTML = dateiKnoepfe(schluessel);
      })
      .catch((e) => {
        const ziel = document.getElementById('pdfknoepfe');
        if (ziel) ziel.innerHTML = `<span class="fehler">Die PDF-Datei konnte nicht erzeugt werden: ${h(e.message)}</span>`;
      });
  }
  const betreff = encodeURIComponent(`${r.typ === 'storno' ? 'Stornorechnung' : 'Rechnung'} ${r.nr}`);
  const mailText = encodeURIComponent(`Guten Tag,\n\nim Anhang erhalten Sie die ${r.typ === 'storno' ? 'Stornorechnung' : 'Rechnung'} ${r.nr}.\n\nMit freundlichen Grüßen\n${daten.betrieb.name}`);
  return `<div class="leiste"><a class="knopf" href="#rechnungen">Zurück</a><h1 style="margin:0">${r.typ === 'storno' ? 'Stornorechnung' : 'Rechnung'} ${h(r.nr)}</h1><span class="marke ${art}">${h(status)}</span></div>
    <div class="karte">
      <div class="raster">
        <div><span class="klein">Kunde</span><p>${[r.kunde.firma, r.kunde.name, r.kunde.strasse, `${r.kunde.plz} ${r.kunde.ort}`].filter(Boolean).map(h).join('<br>')}</p></div>
        <div><span class="klein">Rechnungsdatum</span><p>${datumDeutsch(r.datum)}</p><span class="klein">Leistungsdatum</span><p>${datumDeutsch(r.leistungsdatum)}</p></div>
        <div><span class="klein">Zahlart</span><p>${ZAHLARTEN[r.zahlart].text}</p>${r.bezugNr ? `<span class="klein">Zur Rechnung</span><p><a href="#rechnung/${h(r.bezugNr)}">${h(r.bezugNr)}</a></p>` : ''}</div>
      </div>
      <div class="tabelle-rahmen"><table><tr><th>Leistung</th><th class="betrag">Menge</th><th class="betrag">Einzelpreis</th><th class="betrag">Netto</th></tr>
      ${r.positionen.map((p) => `<tr><td>${h(p.bezeichnung)}</td><td class="betrag">${String(p.menge).replace('.', ',')} ${EINHEITEN[p.einheit]}</td><td class="betrag">${euro(p.einzelpreisCent)}</td><td class="betrag">${euro(vz * zeilenNetto(p.menge, p.einzelpreisCent))}</td></tr>`).join('')}</table></div>
      <table class="summen"><tr><td>Summe netto</td><td>${euro(vz * s.netto)}</td></tr><tr><td>Umsatzsteuer 19 %</td><td>${euro(vz * s.ust)}</td></tr><tr><td><b>Rechnungsbetrag</b></td><td><b>${euro(vz * s.brutto)}</b></td></tr></table>
      <p class="klein">${kassenHinweis(r)}</p>
    </div>
    <div class="karte">
      <h2>PDF mit eingebetteter E-Rechnung (ZUGFeRD)</h2>
      <div class="leiste" id="pdfknoepfe">${dateiKnoepfe(schluessel)}</div>
      <p class="klein">Per Mail: „Teilen“ wählen und das Mailprogramm antippen. Erscheint „Teilen“ nicht, die Datei herunterladen und an eine Mail anhängen:
      <a href="mailto:${encodeURIComponent(r.kunde.email || '')}?subject=${betreff}&body=${mailText}">Mail vorbereiten</a></p>
    </div>
    ${
      art === 'offen'
        ? `<div class="karte"><h2>Zahlung eingegangen</h2>
      <form data-form="eingang" data-nr="${h(r.nr)}"><div class="raster">
        <label>Datum<input type="date" name="datum" value="${heute()}" required /></label>
        <label>Zahlart<select name="zahlart">${Object.entries(ZAHLARTEN).map(([id, z]) => `<option value="${id}" ${r.zahlart === id ? 'selected' : ''}>${z.text}</option>`).join('')}</select></label>
      </div><button class="haupt">Als bezahlt vermerken</button></form></div>`
        : ''
    }
    ${r.typ !== 'storno' && !r.storniertDurch ? `<div class="leiste"><button data-aktion="rechnungStornieren" data-nr="${h(r.nr)}">Rechnung stornieren</button></div>` : ''}`;
}

function seiteKunden() {
  const liste = (kundenSuche ? kundenTreffer(kundenSuche) : daten.kunden).slice().sort((a, b) => kundenName(a).localeCompare(kundenName(b), 'de'));
  const k = bearbeiteterKunde;
  return `<div class="leiste"><h1 style="margin:0">Kunden</h1><button class="haupt platz" data-aktion="kundeNeu">Neuer Kunde</button></div>
    ${
      k
        ? `<div class="karte"><h2>${k.id ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h2><form data-form="kunde"><div class="raster">
        <label>Firma / Stall (optional)<input name="firma" value="${h(k.firma)}" /></label>
        <label>Name<input name="name" value="${h(k.name)}" /></label>
        <label>Straße und Hausnummer<input name="strasse" value="${h(k.strasse)}" required /></label>
        <label>PLZ<input name="plz" value="${h(k.plz)}" required inputmode="numeric" /></label>
        <label>Ort<input name="ort" value="${h(k.ort)}" required /></label>
        <label>E-Mail<input name="email" type="email" value="${h(k.email)}" /></label>
        <label>Telefon<input name="telefon" value="${h(k.telefon)}" /></label>
      </div><label>Notiz<textarea name="notiz" rows="2">${h(k.notiz)}</textarea></label>
      <p class="fehler" id="fehler"></p>
      <div class="leiste"><button class="haupt">Speichern</button><button type="button" data-aktion="kundeAbbrechen">Abbrechen</button></div></form></div>`
        : ''
    }
    <div class="karte">
      <label>Suchen<input id="kundenfilter" value="${h(kundenSuche)}" placeholder="Name, Firma oder Ort" autocomplete="off" /></label>
      <div id="kundenliste">${kundenListe(liste)}</div>
    </div>`;
}

function kundenListe(liste) {
  if (!liste.length) return '<p class="klein">Keine Kunden gefunden.</p>';
  return `<p class="klein">${liste.length} Kunden</p><div class="tabelle-rahmen"><table><tr><th>Name</th><th>Adresse</th><th>Kontakt</th><th></th></tr>
    ${liste
      .map(
        (k) => `<tr><td>${h(kundenName(k))}${k.firma && k.name ? `<br><span class="klein">${h(k.name)}</span>` : ''}</td><td>${h(k.strasse)}<br>${h(k.plz)} ${h(k.ort)}</td><td>${h(k.email)}<br>${h(k.telefon)}</td>
        <td class="betrag"><button class="klein-knopf" data-aktion="kundeRechnung" data-id="${k.id}">Rechnung</button> <button class="klein-knopf" data-aktion="kundeBearbeiten" data-id="${k.id}">Bearbeiten</button></td></tr>`,
      )
      .join('')}</table></div>`;
}

function seiteKasse() {
  const m = kassenMonat(daten.kasse, kasseMonat);
  return `<h1>Kassenbuch</h1>
    <div class="karte">
      <h2>Neuer Eintrag</h2>
      <form data-form="kasse"><div class="raster">
        <label>Datum<input type="date" name="datum" value="${heute()}" required /></label>
        <label>Art<select name="art"><option value="einnahme">Einnahme</option><option value="ausgabe">Ausgabe</option></select></label>
        <label>Betrag €<input name="betrag" inputmode="decimal" required /></label>
        <label>Buchungstext<input name="text" required /></label>
      </div><p class="fehler" id="fehler"></p><button class="haupt">Buchen</button></form>
      <p class="klein" style="margin-top:10px">Einträge können nicht geändert oder gelöscht werden. Ein falscher Eintrag wird storniert und bleibt sichtbar.</p>
    </div>
    <div class="karte">
      <div class="leiste"><label style="margin:0">Monat<input type="month" id="kassemonat" value="${kasseMonat}" /></label>
        <div class="platz rechts"><span class="klein">Bestand Ende ${h(monatsName(kasseMonat))}</span><div class="zahl">${euro(m.ende)}</div></div></div>
      <div class="tabelle-rahmen"><table><tr><th>Nr.</th><th>Datum</th><th>Buchungstext</th><th class="betrag">Einnahme</th><th class="betrag">Ausgabe</th><th class="betrag">Bestand</th><th></th></tr>
        <tr><td></td><td></td><td>Anfangsbestand</td><td></td><td></td><td class="betrag">${euro(m.anfang)}</td><td></td></tr>
        ${m.zeilen
          .map(
            (e) => `<tr class="${e.storniert ? 'storniert' : ''}"><td>${e.nr}</td><td>${datumDeutsch(e.datum)}</td><td>${h(e.text)}</td>
            <td class="betrag">${e.art === 'einnahme' ? euro(e.betragCent) : ''}</td><td class="betrag">${e.art === 'ausgabe' ? euro(e.betragCent) : ''}</td><td class="betrag frei">${euro(e.saldo)}</td>
            <td class="frei">${e.storniert ? `<span class="klein">storniert am ${datumDeutsch(e.storniertAm)}: ${h(e.stornoGrund)}</span>` : `<button class="klein-knopf" data-aktion="kasseStorno" data-nr="${e.nr}">Stornieren</button>`}</td></tr>`,
          )
          .join('')}
      </table></div>
      <table class="summen"><tr><td>Einnahmen</td><td>${euro(m.einnahmen)}</td></tr><tr><td>Ausgaben</td><td>${euro(m.ausgaben)}</td></tr><tr><td><b>Endbestand</b></td><td><b>${euro(m.ende)}</b></td></tr></table>
    </div>
    <div class="karte"><h2>Monatsabschluss ${h(monatsName(kasseMonat))}</h2>
      <div class="leiste"><button class="haupt" data-aktion="kasseExport">PDF und Excel erzeugen</button></div>
      <div id="kasseexport"></div>
    </div>`;
}

function seiteEinstellungen() {
  const b = daten.betrieb;
  return `<h1>Einstellungen</h1>
    <div class="karte"><h2>Sicherung</h2>
      <p class="klein">Die Sicherungsdatei ist verschlüsselt und nur mit dem Passwort lesbar. Lege sie an einem sicheren Ort ab, zum Beispiel in iCloud Drive oder auf einem USB-Stick. ${daten.letzteSicherung ? `Letzte Sicherung: ${new Date(daten.letzteSicherung).toLocaleString('de-DE')}.` : 'Es gibt noch keine Sicherung.'}</p>
      <div class="leiste"><button class="haupt" data-aktion="sicherungErzeugen">Sicherung erzeugen</button><button data-aktion="sicherungWaehlen">Sicherung einspielen</button></div>
      <div class="leiste" id="sicherungknoepfe"></div>
      <input type="file" id="sicherungsdatei" accept=".json,application/json" hidden />
    </div>
    <div class="karte"><h2>Betrieb</h2><form data-form="betrieb"><div class="raster">
      <label>Name<input name="name" value="${h(b.name)}" required /></label>
      <label>Straße und Hausnummer<input name="strasse" value="${h(b.strasse)}" required /></label>
      <label>PLZ<input name="plz" value="${h(b.plz)}" required /></label>
      <label>Ort<input name="ort" value="${h(b.ort)}" required /></label>
      <label>USt-IdNr.<input name="ustId" value="${h(b.ustId)}" /></label>
      <label>Steuernummer<input name="steuernummer" value="${h(b.steuernummer)}" /></label>
      <label>IBAN<input name="iban" value="${h(b.iban)}" /></label>
      <label>Bank<input name="bank" value="${h(b.bank)}" /></label>
      <label>E-Mail<input name="email" type="email" value="${h(b.email)}" /></label>
      <label>Telefon<input name="telefon" value="${h(b.telefon)}" /></label>
      <label>Zahlungsziel in Tagen<input name="zahlungszielTage" type="number" min="0" max="90" value="${b.zahlungszielTage}" required /></label>
    </div><p class="fehler" id="fehler-betrieb"></p><button class="haupt">Speichern</button></form></div>
    <div class="karte"><h2>Preisliste</h2>
      <div class="tabelle-rahmen"><table><tr><th>Leistung</th><th>Einheit</th><th class="betrag">Netto</th><th class="betrag">Brutto</th><th></th></tr>
      ${daten.leistungen.map((l) => `<tr><td>${h(l.bezeichnung)}</td><td>${EINHEITEN[l.einheit]}</td><td class="betrag">${euro(l.einzelpreisCent)}</td><td class="betrag">${euro(rechnungsSummen([{ menge: 1, einzelpreisCent: l.einzelpreisCent }]).brutto)}</td><td class="betrag"><button class="klein-knopf" data-aktion="leistungWeg" data-id="${l.id}">Entfernen</button></td></tr>`).join('')}</table></div>
      <form data-form="leistung"><div class="raster">
        <label>Leistung<input name="bezeichnung" required /></label>
        <label>Einheit<select name="einheit">${Object.entries(EINHEITEN).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}</select></label>
        <label>Einzelpreis netto €<input name="preis" inputmode="decimal" required /></label>
      </div><p class="fehler" id="fehler-leistung"></p><button>Zur Preisliste hinzufügen</button></form>
    </div>
    <div class="karte"><h2>Design</h2><div class="leiste">
      ${[['werkstatt', 'A Werkstatt'], ['buero', 'B Büro'], ['stall', 'C Stall']].map(([id, name]) => `<button class="${daten.design === id ? 'haupt' : ''}" data-aktion="design" data-design="${id}">${name}</button>`).join('')}
    </div></div>
    <div class="karte"><h2>Passwort ändern</h2><form data-form="passwort"><div class="raster">
      <label>Aktuelles Passwort<input type="password" name="alt" required autocomplete="current-password" /></label>
      <label>Neues Passwort (mindestens 8 Zeichen)<input type="password" name="p1" minlength="8" required autocomplete="new-password" /></label>
      <label>Neues Passwort wiederholen<input type="password" name="p2" minlength="8" required autocomplete="new-password" /></label>
    </div><p class="fehler" id="fehler-passwort"></p><button>Passwort ändern</button></form></div>
    <div class="karte"><h2>Zum Ausprobieren</h2>
      <p class="klein">Lädt erfundene Kunden, Rechnungen und Kassenbucheinträge aus dem Vormonat und dem laufenden Monat dazu.</p>
      <div class="leiste"><button data-aktion="beispieldaten">Beispieldaten laden</button><button data-aktion="allesLoeschen">Alle Daten löschen</button></div>
    </div>`;
}

function zeige() {
  if (!daten) return;
  const [seite, ...rest] = decodeURIComponent(location.hash.slice(1) || 'start').split('/');
  const ansichten = {
    start: seiteStart,
    rechnungen: seiteRechnungen,
    'rechnung-neu': seiteRechnungNeu,
    rechnung: () => seiteRechnung(rest.join('/')),
    kunden: seiteKunden,
    kasse: seiteKasse,
    einstellungen: seiteEinstellungen,
  };
  const menue = seite.startsWith('rechnung') ? 'rechnungen' : seite;
  app.innerHTML = rahmen(menue, (ansichten[seite] || seiteStart)());
  window.scrollTo(0, 0);
}

// ---------- Aktionen ----------

function fehler(text, id = 'fehler') {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
  return false;
}

function passwortPruefen(w, id = 'fehler') {
  if (w.p1.length < 8) return fehler('Das Passwort braucht mindestens 8 Zeichen.', id);
  if (w.p1 !== w.p2) return fehler('Die beiden Passwörter stimmen nicht überein.', id);
  return true;
}

function kasseBuchen({ datum, art, betragCent, text, rechnungNr = null }) {
  const nr = daten.kasse.reduce((max, e) => Math.max(max, e.nr), 0) + 1;
  daten.kasse.push({ nr, datum, art, betragCent, text, rechnungNr, erfasstAm: new Date().toISOString(), storniert: false });
}

const formulare = {
  async einrichten(w) {
    if (!passwortPruefen(w)) return;
    const start = startDaten();
    const code = await speicher.einrichten(w.p1, start);
    if (navigator.storage?.persist) navigator.storage.persist();
    zeigeCode(code, () => nachAnmeldung(start));
  },
  async anmelden(w) {
    const geladen = await speicher.oeffnen(w.passwort);
    if (!geladen) return fehler('Das Passwort stimmt nicht.');
    nachAnmeldung(geladen);
  },
  async zuruecksetzen(w) {
    if (!passwortPruefen(w)) return;
    const ergebnis = await speicher.zuruecksetzen(w.code, w.p1);
    if (!ergebnis) return fehler('Der Wiederherstellungscode stimmt nicht.');
    zeigeCode(ergebnis.code, () => nachAnmeldung(ergebnis.daten));
  },
  async rechnung() {
    entwurfLesen();
    const k = entwurf.kunde;
    const b = daten.betrieb;
    if (!k.name && !k.firma) return fehler('Bitte einen Namen oder eine Firma eintragen.');
    if (!k.strasse || !k.plz || !k.ort) return fehler('Bitte die Adresse des Kunden vollständig eintragen.');
    if (!entwurf.datum || !entwurf.leistungsdatum) return fehler('Bitte Rechnungsdatum und Leistungsdatum eintragen.');
    if (!b.ustId && !b.steuernummer) return fehler('In den Einstellungen fehlt die USt-IdNr. oder Steuernummer.');
    if (entwurf.zahlart === 'ueberweisung' && !b.iban) return fehler('Für Überweisung fehlt die IBAN in den Einstellungen.');
    const positionen = [];
    for (const [i, p] of entwurf.positionen.entries()) {
      const menge = Number(String(p.menge).replace(',', '.'));
      const einzelpreisCent = euroZuCent(p.preis);
      if (!p.bezeichnung) return fehler(`Position ${i + 1}: Die Leistung fehlt.`);
      if (!Number.isFinite(menge) || menge <= 0) return fehler(`Position ${i + 1}: Die Menge ist keine gültige Zahl.`);
      if (einzelpreisCent === null || einzelpreisCent < 0) return fehler(`Position ${i + 1}: Der Preis ist kein gültiger Betrag.`);
      positionen.push({ bezeichnung: p.bezeichnung, menge, einheit: p.einheit, einzelpreisCent });
    }
    const summen = rechnungsSummen(positionen);
    if (summen.brutto <= 0) return fehler('Der Rechnungsbetrag muss größer als 0 sein.');
    if (!(await frage(`Rechnung über ${euro(summen.brutto)} an ${kundenName(k)} ausstellen? Danach kann sie nicht mehr geändert werden.`, { ja: 'Ausstellen' }))) return;

    let kunde = daten.kunden.find((x) => x.id === entwurf.kundeId);
    if (kunde) Object.assign(kunde, k);
    else {
      kunde = { id: neueId(), telefon: '', notiz: '', ...k };
      daten.kunden.push(kunde);
    }
    const nr = naechsteNummer('RE', entwurf.datum.slice(0, 4), daten.rechnungen.map((r) => r.nr));
    daten.rechnungen.push({
      nr,
      typ: 'rechnung',
      datum: entwurf.datum,
      leistungsdatum: entwurf.leistungsdatum,
      faelligAm: tagePlus(entwurf.datum, Number(b.zahlungszielTage)),
      zahlart: entwurf.zahlart,
      bezahlt: entwurf.bezahlt,
      kundeId: kunde.id,
      kunde: { ...k },
      positionen,
      hinweis: entwurf.hinweis,
      ausgestelltAm: new Date().toISOString(),
    });
    if (entwurf.bezahlt && entwurf.zahlart === 'bar') kasseBuchen({ datum: entwurf.datum, art: 'einnahme', betragCent: summen.brutto, text: `Rechnung ${nr}, ${kundenName(k)}`, rechnungNr: nr });
    await sichern();
    entwurf = null;
    location.hash = `#rechnung/${nr}`;
  },
  async eingang(w, form) {
    const r = daten.rechnungen.find((x) => x.nr === form.dataset.nr);
    r.eingang = { datum: w.datum, zahlart: w.zahlart };
    if (w.zahlart === 'bar') kasseBuchen({ datum: w.datum, art: 'einnahme', betragCent: rechnungsSummen(r.positionen).brutto, text: `Rechnung ${r.nr}, ${kundenName(r.kunde)}`, rechnungNr: r.nr });
    await sichern();
    zeige();
  },
  async kunde(w) {
    if (!w.name.trim() && !w.firma.trim()) return fehler('Bitte einen Namen oder eine Firma eintragen.');
    const werte = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.trim()]));
    if (bearbeiteterKunde.id) Object.assign(daten.kunden.find((k) => k.id === bearbeiteterKunde.id), werte);
    else daten.kunden.push({ id: neueId(), ...werte });
    bearbeiteterKunde = null;
    await sichern();
    zeige();
  },
  async kasse(w) {
    const betragCent = euroZuCent(w.betrag);
    if (betragCent === null || betragCent <= 0) return fehler('Der Betrag ist kein gültiger Betrag.');
    if (w.art === 'ausgabe' && kassenBestand(daten.kasse) - betragCent < 0) return fehler(`Die Ausgabe ist höher als der Kassenbestand von ${euro(kassenBestand(daten.kasse))}. Eine Kasse kann nicht im Minus sein.`);
    kasseBuchen({ datum: w.datum, art: w.art, betragCent, text: w.text.trim() });
    kasseMonat = w.datum.slice(0, 7);
    await sichern();
    zeige();
  },
  async betrieb(w) {
    if (!w.ustId.trim() && !w.steuernummer.trim()) return fehler('Bitte USt-IdNr. oder Steuernummer eintragen.', 'fehler-betrieb');
    Object.assign(daten.betrieb, Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.trim()])), { zahlungszielTage: Number(w.zahlungszielTage) });
    dateien = {};
    await sichern();
    zeige();
  },
  async leistung(w) {
    const einzelpreisCent = euroZuCent(w.preis);
    if (einzelpreisCent === null || einzelpreisCent < 0) return fehler('Der Preis ist kein gültiger Betrag.', 'fehler-leistung');
    daten.leistungen.push({ id: neueId(), bezeichnung: w.bezeichnung.trim(), einheit: w.einheit, einzelpreisCent });
    await sichern();
    zeige();
  },
  async passwort(w, form) {
    if (!passwortPruefen(w, 'fehler-passwort')) return;
    if (!(await speicher.passwortAendern(w.alt, w.p1))) return fehler('Das aktuelle Passwort stimmt nicht.', 'fehler-passwort');
    form.reset();
    meldung('Das Passwort wurde geändert. Der Wiederherstellungscode bleibt gültig.');
  },
};

const aktionen = {
  gehe: (el) => (location.hash = el.dataset.ziel),
  drucken: () => window.print(),
  vergessen: zeigeVergessen,
  zurAnmeldung: zeigeAnmeldung,
  sperren() {
    speicher.sperren();
    daten = null;
    entwurf = null;
    dateien = {};
    zeigeAnmeldung();
  },
  teilen(el) {
    const d = dateien[el.dataset.datei];
    navigator.share({ files: [d.datei], title: d.datei.name }).catch(() => {});
  },
  positionDazu() {
    entwurfLesen();
    entwurf.positionen.push({ bezeichnung: '', menge: '1', einheit: 'C62', preis: '' });
    zeige();
  },
  positionWeg(el) {
    entwurfLesen();
    entwurf.positionen.splice(Number(el.dataset.index), 1);
    if (!entwurf.positionen.length) entwurf.positionen.push({ bezeichnung: '', menge: '1', einheit: 'C62', preis: '' });
    zeige();
  },
  kundeWaehlen(el) {
    entwurfLesen();
    const k = daten.kunden.find((x) => x.id === el.dataset.id);
    entwurf.kundeId = k.id;
    entwurf.kunde = { firma: k.firma, name: k.name, strasse: k.strasse, plz: k.plz, ort: k.ort, email: k.email };
    zeige();
  },
  kundeLoesen() {
    entwurfLesen();
    entwurf.kundeId = null;
    entwurf.kunde = { firma: '', name: '', strasse: '', plz: '', ort: '', email: '' };
    zeige();
  },
  async entwurfVerwerfen() {
    if (!(await frage('Den Entwurf verwerfen?', { ja: 'Verwerfen' }))) return;
    entwurf = null;
    location.hash = '#rechnungen';
  },
  async rechnungStornieren(el) {
    const r = daten.rechnungen.find((x) => x.nr === el.dataset.nr);
    if (!(await frage(`Rechnung ${r.nr} stornieren? Es wird eine Stornorechnung erzeugt. Die Rechnung bleibt sichtbar.`, { ja: 'Stornieren' }))) return;
    const nr = naechsteNummer('ST', heute().slice(0, 4), daten.rechnungen.map((x) => x.nr));
    daten.rechnungen.push({ ...r, nr, typ: 'storno', bezugNr: r.nr, datum: heute(), bezahlt: false, eingang: undefined, hinweis: '', ausgestelltAm: new Date().toISOString() });
    r.storniertDurch = nr;
    await sichern();
    const barGebucht = daten.kasse.some((e) => e.rechnungNr === r.nr && !e.storniert);
    if (barGebucht) await meldung('Zu dieser Rechnung gibt es eine Bareinnahme im Kassenbuch. Wenn du das Geld zurückgibst, buche dort eine Ausgabe.');
    location.hash = `#rechnung/${nr}`;
  },
  kundeNeu() {
    bearbeiteterKunde = { firma: '', name: '', strasse: '', plz: '', ort: '', email: '', telefon: '', notiz: '' };
    zeige();
  },
  kundeBearbeiten(el) {
    bearbeiteterKunde = { ...daten.kunden.find((k) => k.id === el.dataset.id) };
    zeige();
  },
  kundeAbbrechen() {
    bearbeiteterKunde = null;
    zeige();
  },
  kundeRechnung(el) {
    entwurf = leererEntwurf();
    const k = daten.kunden.find((x) => x.id === el.dataset.id);
    entwurf.kundeId = k.id;
    entwurf.kunde = { firma: k.firma, name: k.name, strasse: k.strasse, plz: k.plz, ort: k.ort, email: k.email };
    location.hash = '#rechnung-neu';
  },
  async kasseStorno(el) {
    const e = daten.kasse.find((x) => x.nr === Number(el.dataset.nr));
    const grund = await frage(`Eintrag ${e.nr} (${e.text}, ${euro(e.betragCent)}) stornieren? Er bleibt sichtbar, zählt aber nicht mehr mit.`, { eingabe: 'Grund der Stornierung', ja: 'Stornieren' });
    if (!grund) return;
    if (e.art === 'einnahme' && kassenBestand(daten.kasse) - e.betragCent < 0) return meldung('Ohne diese Einnahme wäre die Kasse im Minus. Bitte zuerst die Ausgaben prüfen.');
    Object.assign(e, { storniert: true, stornoGrund: grund, storniertAm: heute() });
    await sichern();
    zeige();
  },
  filterLeeren() {
    rechnungsFilter = { suche: '', monat: '', status: '', zahlart: '' };
    zeige();
  },
  rechnungenExport() {
    const liste = gefilterteRechnungen().reverse();
    const s = summeBetraege(liste);
    const f = rechnungsFilter;
    const filterText = [f.suche && `Suche „${f.suche}“`, f.monat && monatsName(f.monat), f.status && STATUS_NAMEN[f.status], f.zahlart && ZAHLARTEN[f.zahlart].text].filter(Boolean).join(', ') || 'keiner';
    const bezahltAm = (r) => (statusArt(r) !== 'bezahlt' ? '' : datumDeutsch(r.eingang ? r.eingang.datum : r.datum));
    const zeilen = [
      [`Rechnungen ${daten.betrieb.name}`],
      [`Filter: ${filterText}. Erzeugt am ${datumDeutsch(heute())}.`],
      [],
      ['Nr.', 'Art', 'Rechnungsdatum', 'Leistungsdatum', 'Kunde', 'Ort', 'Netto', 'Umsatzsteuer', 'Brutto', 'Zahlart', 'Status', 'Bezahlt am', 'Bezug'],
      ...liste.map((r) => {
        const b = betraege(r);
        return [r.nr, r.typ === 'storno' ? 'Stornorechnung' : 'Rechnung', datumDeutsch(r.datum), datumDeutsch(r.leistungsdatum), kundenName(r.kunde), r.kunde.ort, b.netto / 100, b.ust / 100, b.brutto / 100, r.typ === 'storno' ? '' : ZAHLARTEN[zahlartVon(r)].text, STATUS_NAMEN[statusArt(r)], bezahltAm(r), r.bezugNr || r.storniertDurch || ''];
      }),
      [],
      ['', '', '', '', 'Summe', '', s.netto / 100, s.ust / 100, s.brutto / 100],
      ['', '', '', '', 'davon offen', '', '', '', s.offen / 100],
    ];
    const blatt = window.XLSX.utils.aoa_to_sheet(zeilen);
    blatt['!cols'] = [14, 15, 15, 15, 30, 18, 12, 13, 12, 13, 15, 12, 14].map((wch) => ({ wch }));
    const monate = [['Monat', 'Anzahl', 'Netto', 'Umsatzsteuer', 'Brutto', 'davon offen'], ...monatsSummen(daten.rechnungen).map((m) => [monatsName(m.monat), m.anzahl, m.netto / 100, m.ust / 100, m.brutto / 100, m.offen / 100])];
    const blatt2 = window.XLSX.utils.aoa_to_sheet(monate);
    blatt2['!cols'] = [18, 8, 12, 13, 12, 12].map((wch) => ({ wch }));
    for (const [b, spalten] of [[blatt, /^[GHI]\d/], [blatt2, /^[C-F]\d/]]) {
      Object.keys(b).forEach((zelle) => {
        if (typeof b[zelle].v === 'number' && spalten.test(zelle)) b[zelle].z = '#,##0.00';
      });
    }
    const mappe = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(mappe, blatt, 'Rechnungen');
    window.XLSX.utils.book_append_sheet(mappe, blatt2, 'Monatssummen');
    dateiBereit('rechnungen-excel', window.XLSX.write(mappe, { type: 'array', bookType: 'xlsx' }), `Rechnungen_${f.monat || heute()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    document.getElementById('rechnungenexport').innerHTML = dateiKnoepfe('rechnungen-excel', { oeffnen: false });
  },
  async kasseExport() {
    const ziel = document.getElementById('kasseexport');
    ziel.innerHTML = '<span class="klein">Dateien werden erzeugt …</span>';
    const m = kassenMonat(daten.kasse, kasseMonat);
    const pdf = await kassenbuchPdf(await lib(), kasseMonat, daten.kasse, daten.betrieb);
    dateiBereit('kasse-pdf', pdf, `Kassenbuch_${kasseMonat}.pdf`, 'application/pdf');
    const zeilen = [
      [`Kassenbuch ${monatsName(kasseMonat)}`],
      [`${daten.betrieb.name}, ${daten.betrieb.strasse}, ${daten.betrieb.plz} ${daten.betrieb.ort}`],
      [],
      ['Nr.', 'Datum', 'Buchungstext', 'Einnahme', 'Ausgabe', 'Bestand', 'Storniert', 'Stornogrund', 'Storniert am'],
      ['', '', 'Anfangsbestand', '', '', m.anfang / 100],
      ...m.zeilen.map((e) => [e.nr, datumDeutsch(e.datum), e.text, e.art === 'einnahme' ? e.betragCent / 100 : '', e.art === 'ausgabe' ? e.betragCent / 100 : '', e.saldo / 100, e.storniert ? 'ja' : '', e.stornoGrund || '', e.storniertAm ? datumDeutsch(e.storniertAm) : '']),
      [],
      ['', '', 'Summe Einnahmen (ohne Stornos)', m.einnahmen / 100],
      ['', '', 'Summe Ausgaben (ohne Stornos)', '', m.ausgaben / 100],
      ['', '', 'Endbestand', '', '', m.ende / 100],
    ];
    const blatt = window.XLSX.utils.aoa_to_sheet(zeilen);
    blatt['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 42 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 13 }];
    Object.keys(blatt).forEach((zelle) => {
      if (typeof blatt[zelle].v === 'number' && /^[DEF]/.test(zelle)) blatt[zelle].z = '#,##0.00';
    });
    const mappe = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(mappe, blatt, 'Kassenbuch');
    const excel = window.XLSX.write(mappe, { type: 'array', bookType: 'xlsx' });
    dateiBereit('kasse-excel', excel, `Kassenbuch_${kasseMonat}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ziel.innerHTML = `<p><b>PDF</b></p><div class="leiste">${dateiKnoepfe('kasse-pdf')}</div><p><b>Excel</b></p><div class="leiste">${dateiKnoepfe('kasse-excel', { oeffnen: false })}</div>`;
  },
  async sicherungErzeugen() {
    daten.letzteSicherung = new Date().toISOString();
    await sichern();
    dateiBereit('sicherung', await speicher.sicherungErzeugen(), `Hufschmied-Sicherung_${heute()}.json`, 'application/json');
    zeige();
    document.getElementById('sicherungknoepfe').innerHTML = dateiKnoepfe('sicherung', { oeffnen: false });
  },
  sicherungWaehlen() {
    document.getElementById('sicherungsdatei').click();
  },
  async design(el) {
    daten.design = el.dataset.design;
    document.documentElement.dataset.design = daten.design;
    await sichern();
    zeige();
  },
  async leistungWeg(el) {
    daten.leistungen = daten.leistungen.filter((l) => l.id !== el.dataset.id);
    await sichern();
    zeige();
  },
  async beispieldaten() {
    if (!(await frage('Erfundene Beispieldaten dazuladen?', { ja: 'Laden' }))) return;
    const b = beispielDaten(daten);
    daten.kunden.push(...b.kunden);
    daten.rechnungen.push(...b.rechnungen);
    b.kasse.forEach(kasseBuchen);
    await sichern();
    location.hash = '#start';
    zeige();
  },
  async allesLoeschen() {
    const wort = await frage('Wirklich alle Daten und das Passwort auf diesem Gerät löschen? Das lässt sich nur mit einer Sicherungsdatei rückgängig machen.', { eingabe: 'Zum Bestätigen LÖSCHEN eintippen', ja: 'Alles löschen' });
    if (wort !== 'LÖSCHEN') return;
    await speicher.allesLoeschen();
    daten = null;
    location.hash = '';
    zeigeEinrichten();
  },
};

async function sicherungEinlesen(datei) {
  const passwort = await frage(`Sicherung „${datei.name}“ einspielen? Die jetzigen Daten auf diesem Gerät werden ersetzt.`, { eingabe: 'Passwort der Sicherung', ja: 'Einspielen' });
  if (!passwort) return;
  try {
    const geladen = await speicher.sicherungEinspielen(await datei.text(), passwort);
    if (!geladen) return meldung('Das Passwort passt nicht zu dieser Sicherung.');
    dateien = {};
    nachAnmeldung(geladen);
  } catch (e) {
    meldung(`Die Sicherung konnte nicht gelesen werden: ${e.message}`);
  }
}

// ---------- Ereignisse ----------

app.addEventListener('click', (ereignis) => {
  const el = ereignis.target.closest('[data-aktion]');
  if (el && aktionen[el.dataset.aktion]) aktionen[el.dataset.aktion](el);
});

app.addEventListener('submit', (ereignis) => {
  ereignis.preventDefault();
  const form = ereignis.target;
  formulare[form.dataset.form]?.(formWerte(form), form);
});

app.addEventListener('input', (ereignis) => {
  const ziel = ereignis.target;
  if (ziel.id === 'kundensuche') {
    document.getElementById('vorschlaege').innerHTML = kundenTreffer(ziel.value)
      .slice(0, 8)
      .map((k) => `<button type="button" data-aktion="kundeWaehlen" data-id="${k.id}">${h(kundenName(k))}${k.firma && k.name ? ` · ${h(k.name)}` : ''} · ${h(k.plz)} ${h(k.ort)}</button>`)
      .join('');
  } else if (ziel.id === 'rfilter-suche') {
    rechnungsFilter.suche = ziel.value;
    document.getElementById('rechnungsergebnis').innerHTML = rechnungsErgebnis();
    document.getElementById('rechnungenexport').innerHTML = '';
  } else if (ziel.id === 'kundenfilter') {
    kundenSuche = ziel.value;
    const liste = (kundenSuche ? kundenTreffer(kundenSuche) : daten.kunden).slice().sort((a, b) => kundenName(a).localeCompare(kundenName(b), 'de'));
    document.getElementById('kundenliste').innerHTML = kundenListe(liste);
  } else if (ziel.closest('[data-form="rechnung"]')) {
    entwurfLesen();
    document.getElementById('summen').innerHTML = summenHtml();
  }
});

app.addEventListener('change', (ereignis) => {
  const ziel = ereignis.target;
  if (ziel.id === 'preisliste' && ziel.value) {
    entwurfLesen();
    const l = daten.leistungen.find((x) => x.id === ziel.value);
    const neu = { bezeichnung: l.bezeichnung, menge: '1', einheit: l.einheit, preis: centZuText(l.einzelpreisCent) };
    const leer = entwurf.positionen.findIndex((p) => !p.bezeichnung && !p.preis);
    if (leer >= 0) entwurf.positionen[leer] = neu;
    else entwurf.positionen.push(neu);
    zeige();
  } else if (ziel.dataset.filter && ziel.tagName === 'SELECT') {
    rechnungsFilter[ziel.dataset.filter] = ziel.value;
    document.getElementById('rechnungsergebnis').innerHTML = rechnungsErgebnis();
    document.getElementById('rechnungenexport').innerHTML = '';
  } else if (ziel.id === 'kassemonat' && ziel.value) {
    kasseMonat = ziel.value;
    zeige();
  } else if (ziel.id === 'sicherungsdatei' && ziel.files[0]) {
    sicherungEinlesen(ziel.files[0]);
  } else if (ziel.name === 'zahlart' && ziel.closest('[data-form="rechnung"]')) {
    ziel.form.elements.bezahlt.checked = ziel.value !== 'ueberweisung';
    entwurfLesen();
  }
});

window.addEventListener('hashchange', zeige);

['click', 'keydown', 'touchstart'].forEach((art) => document.addEventListener(art, () => (letzteAktivitaet = Date.now()), { passive: true }));
setInterval(() => {
  if (daten && Date.now() - letzteAktivitaet > SPERRE_NACH_MINUTEN * 60000) aktionen.sperren();
}, 30000);

(await speicher.istEingerichtet()) ? zeigeAnmeldung() : zeigeEinrichten();
