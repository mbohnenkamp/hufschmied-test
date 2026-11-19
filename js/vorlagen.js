// Startwerte und erfundene Beispieldaten für die Testversion. Hier stehen nie echte Kundendaten.
import { heute, tagePlus, naechsteNummer, rechnungsSummen } from './rechnen.js';

export function startDaten() {
  return {
    version: 1,
    design: 'werkstatt',
    letzteSicherung: null,
    betrieb: {
      name: 'Max Mustermann',
      strasse: 'Musterstrasse 2',
      plz: '00000',
      ort: 'Musterstadt',
      ustId: 'DE123456789',
      steuernummer: '',
      iban: 'DE02 1203 0000 0000 2020 51',
      bank: 'Musterbank',
      email: 'max.mustermann@example.com',
      telefon: '',
      zahlungszielTage: 14,
    },
    // Beispielpreise, frei erfunden. In den Einstellungen änderbar.
    leistungen: [
      { id: 'l1', bezeichnung: 'Beschlag, 4 Eisen', einheit: 'C62', einzelpreisCent: 12000 },
      { id: 'l2', bezeichnung: 'Beschlag, 2 Eisen', einheit: 'C62', einzelpreisCent: 7000 },
      { id: 'l3', bezeichnung: 'Ausschneiden (Barhuf)', einheit: 'C62', einzelpreisCent: 4000 },
      { id: 'l4', bezeichnung: 'Anfahrt', einheit: 'KMT', einzelpreisCent: 50 },
    ],
    kunden: [],
    rechnungen: [],
    kasse: [],
  };
}

export function beispielDaten(daten) {
  const diesenMonat = `${heute().slice(0, 7)}-01`;
  const vormonat = `${tagePlus(diesenMonat, -1).slice(0, 7)}-01`;
  const tag = (monatsanfang, t) => {
    const datum = tagePlus(monatsanfang, t - 1);
    return datum > heute() ? heute() : datum;
  };
  const kunden = [
    { firma: 'Reitstall Muster GmbH', name: 'Erika Beispiel', strasse: 'Stallweg 1', plz: '00000', ort: 'Musterstadt' },
    { firma: '', name: 'Hans Probe', strasse: 'Koppelstrasse 12', plz: '00001', ort: 'Beispielhausen' },
    { firma: 'Gestüt Testhof', name: 'Petra Test', strasse: 'Am Hof 5', plz: '00002', ort: 'Probedorf' },
    { firma: '', name: 'Lena Muster', strasse: 'Wiesenweg 8', plz: '00000', ort: 'Musterstadt' },
  ].map((k, i) => ({ id: crypto.randomUUID(), email: `kunde${i + 1}@example.com`, telefon: '', notiz: 'Beispielkunde', ...k }));

  const [l1, l2, l3, l4] = daten.leistungen.length >= 4 ? daten.leistungen : startDaten().leistungen;
  const pos = (l, menge = 1) => ({ bezeichnung: l.bezeichnung, menge, einheit: l.einheit, einzelpreisCent: l.einzelpreisCent });
  const plan = [
    [kunden[0], tag(vormonat, 4), 'ueberweisung', false, [pos(l1, 2), pos(l4, 18)]],
    [kunden[1], tag(vormonat, 9), 'bar', true, [pos(l3), pos(l4, 12)]],
    [kunden[2], tag(vormonat, 17), 'paypal', true, [pos(l1), pos(l2)]],
    [kunden[3], tag(vormonat, 24), 'bar', true, [pos(l2), pos(l4, 7)]],
    [kunden[0], tag(diesenMonat, 3), 'ueberweisung', false, [pos(l1, 3), pos(l4, 18)]],
    [kunden[1], tag(diesenMonat, 6), 'bar', true, [pos(l3, 2)]],
  ];

  const nummern = daten.rechnungen.map((r) => r.nr);
  const kasse = [{ datum: tag(vormonat, 1), art: 'einnahme', betragCent: 10000, text: 'Anfangsbestand Wechselgeld (Beispiel)' }];
  const rechnungen = plan.map(([kunde, datum, zahlart, bezahlt, positionen]) => {
    const nr = naechsteNummer('RE', datum.slice(0, 4), nummern);
    nummern.push(nr);
    const name = kunde.firma || kunde.name;
    if (zahlart === 'bar') kasse.push({ datum, art: 'einnahme', betragCent: rechnungsSummen(positionen).brutto, text: `Rechnung ${nr}, ${name}`, rechnungNr: nr });
    const { firma, strasse, plz, ort, email } = kunde;
    return { nr, typ: 'rechnung', datum, leistungsdatum: datum, faelligAm: tagePlus(datum, 14), zahlart, bezahlt, kundeId: kunde.id, kunde: { firma, name: kunde.name, strasse, plz, ort, email }, positionen, hinweis: '', ausgestelltAm: new Date().toISOString() };
  });
  kasse.push({ datum: tag(vormonat, 12), art: 'ausgabe', betragCent: 4590, text: 'Hufnägel und Raspel (Beispiel)' });
  kasse.push({ datum: tag(vormonat, 28), art: 'ausgabe', betragCent: 15000, text: 'Einzahlung auf Bankkonto (Beispiel)' });
  kasse.push({ datum: tag(diesenMonat, 2), art: 'ausgabe', betragCent: 1250, text: 'Porto (Beispiel)' });
  kasse.sort((a, b) => a.datum.localeCompare(b.datum));
  return { kunden, rechnungen, kasse };
}
