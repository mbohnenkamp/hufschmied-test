import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { rechnungPdf, kassenbuchPdf } from '../js/pdf.js';
import { lib, betrieb, beispielRechnung } from './hilfe.js';

const ziel = process.env.PDF_ZIEL;
const sichern = (name, bytes) => {
  if (!ziel) return;
  mkdirSync(ziel, { recursive: true });
  writeFileSync(`${ziel}/${name}`, bytes);
};

const varianten = {
  ueberweisung: beispielRechnung,
  bar: { ...beispielRechnung, nr: 'RE-2026-0002', zahlart: 'bar', bezahlt: true },
  paypal: { ...beispielRechnung, nr: 'RE-2026-0003', zahlart: 'paypal', bezahlt: true },
  storno: { ...beispielRechnung, nr: 'ST-2026-0001', typ: 'storno', bezugNr: 'RE-2026-0001' },
  gemischt: { ...beispielRechnung, nr: 'RE-2026-0004', positionen: [...beispielRechnung.positionen, { bezeichnung: 'Mineralfutter 10 kg', menge: 2, einheit: 'C62', einzelpreisCent: 2490, ustSatz: 7 }] },
  nurFutter: { ...beispielRechnung, nr: 'RE-2026-0005', zahlart: 'bar', bezahlt: true, positionen: [{ bezeichnung: 'Mineralfutter 10 kg', menge: 3, einheit: 'C62', einzelpreisCent: 2490, ustSatz: 7 }] },
  stornoGemischt: { ...beispielRechnung, nr: 'ST-2026-0002', typ: 'storno', bezugNr: 'RE-2026-0004', positionen: [...beispielRechnung.positionen, { bezeichnung: 'Mineralfutter 10 kg', menge: 2, einheit: 'C62', einzelpreisCent: 2490, ustSatz: 7 }] },
};

for (const [name, rechnung] of Object.entries(varianten)) {
  test(`Rechnungs-PDF (${name}) enthält die XML-Datei`, async () => {
    const bytes = await rechnungPdf(lib, rechnung, betrieb);
    sichern(`${name}.pdf`, bytes);
    const doc = await lib.PDFLib.PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    const text = Buffer.from(bytes).toString('latin1');
    assert.ok(text.includes('factur-x.xml'));
    assert.ok(text.includes('EN 16931'));
  });
}

test('Kassenbuch-PDF wird erzeugt', async () => {
  const eintraege = [
    { nr: 1, datum: '2026-11-02', art: 'einnahme', betragCent: 5000, text: 'Rechnung RE-2026-0002 bar' },
    { nr: 2, datum: '2026-11-03', art: 'einnahme', betragCent: 2000, text: 'Falsch gebucht', storniert: true, stornoGrund: 'Tippfehler', storniertAm: '2026-11-03' },
    { nr: 3, datum: '2026-11-10', art: 'ausgabe', betragCent: 1000, text: 'Hufnägel' },
  ];
  const bytes = await kassenbuchPdf(lib, '2026-11', eintraege, betrieb);
  sichern('kassenbuch.pdf', bytes);
  assert.ok(bytes.length > 1000);
});
