import test from 'node:test';
import assert from 'node:assert/strict';
import { euroZuCent, centZuText, rechnungsSummen, naechsteNummer, kassenMonat, kassenBestand, tagePlus, datumAlsText } from '../js/rechnen.js';
import { zugferdXml } from '../js/zugferd.js';
import { beispielRechnung, betrieb } from './hilfe.js';

test('Eingaben in Euro werden zu Cent', () => {
  assert.equal(euroZuCent('12,50'), 1250);
  assert.equal(euroZuCent('1.234,56 €'), 123456);
  assert.equal(euroZuCent('12.5'), 1250);
  assert.equal(euroZuCent('95'), 9500);
  assert.equal(euroZuCent(''), null);
  assert.equal(euroZuCent('abc'), null);
});

test('Cent werden deutsch geschrieben', () => {
  assert.equal(centZuText(123456), '1.234,56');
  assert.equal(centZuText(5), '0,05');
  assert.equal(centZuText(-1250), '-12,50');
});

test('Rechnungssummen: 95,00 + 4 x 12,50 + 18 x 0,45 = 153,10 netto, 29,09 USt, 182,19 brutto', () => {
  // 153,10 x 19 % = 29,089 -> 29,09
  assert.deepEqual(rechnungsSummen(beispielRechnung.positionen), { netto: 15310, ust: 2909, brutto: 18219 });
});

test('Rechnungsnummern laufen je Jahr fort', () => {
  assert.equal(naechsteNummer('RE', 2026, []), 'RE-2026-0001');
  assert.equal(naechsteNummer('RE', 2026, ['RE-2026-0001', 'RE-2026-0007', 'RE-2025-0090']), 'RE-2026-0008');
  assert.equal(naechsteNummer('RE', 2027, ['RE-2026-0007']), 'RE-2027-0001');
});

test('Datum: Monatswechsel und kein UTC-Versatz', () => {
  assert.equal(tagePlus('2026-11-19', 14), '2026-12-03');
  assert.equal(tagePlus('2026-12-25', 14), '2027-01-08');
  assert.equal(datumAlsText(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
});

test('Kassenbuch: Stornos bleiben sichtbar, zählen aber nicht', () => {
  const eintraege = [
    { nr: 1, datum: '2026-10-05', art: 'einnahme', betragCent: 10000, text: 'a' },
    { nr: 2, datum: '2026-10-20', art: 'ausgabe', betragCent: 3000, text: 'b' },
    { nr: 3, datum: '2026-11-02', art: 'einnahme', betragCent: 5000, text: 'c' },
    { nr: 4, datum: '2026-11-03', art: 'einnahme', betragCent: 2000, text: 'd', storniert: true, stornoGrund: 'Tippfehler', storniertAm: '2026-11-03' },
    { nr: 5, datum: '2026-11-10', art: 'ausgabe', betragCent: 1000, text: 'e' },
  ];
  const nov = kassenMonat(eintraege, '2026-11');
  // Oktober: 100 - 30 = 70. November: 70 + 50 - 10 = 110, die stornierten 20 fehlen.
  assert.equal(nov.anfang, 7000);
  assert.equal(nov.einnahmen, 5000);
  assert.equal(nov.ausgaben, 1000);
  assert.equal(nov.ende, 11000);
  assert.equal(nov.zeilen.length, 3);
  assert.equal(nov.zeilen[1].saldo, 12000);
  assert.equal(kassenBestand(eintraege), 11000);
});

test('XML enthält die Summen und maskiert Sonderzeichen', () => {
  const xml = zugferdXml({ ...beispielRechnung, kunde: { ...beispielRechnung.kunde, firma: 'Müller & Söhne <Hof>' } }, betrieb);
  assert.match(xml, /<ram:GrandTotalAmount>182\.19<\/ram:GrandTotalAmount>/);
  assert.match(xml, /<ram:DuePayableAmount>182\.19<\/ram:DuePayableAmount>/);
  assert.match(xml, /Müller &amp; Söhne &lt;Hof&gt;/);
  assert.match(xml, /<ram:IBANID>DE02120300000000202051<\/ram:IBANID>/);
});

test('Bar bezahlte Rechnung hat keinen offenen Betrag', () => {
  const xml = zugferdXml({ ...beispielRechnung, zahlart: 'bar', bezahlt: true }, betrieb);
  assert.match(xml, /<ram:TotalPrepaidAmount>182\.19<\/ram:TotalPrepaidAmount><ram:DuePayableAmount>0\.00<\/ram:DuePayableAmount>/);
  assert.match(xml, /<ram:TypeCode>10<\/ram:TypeCode>/);
});
