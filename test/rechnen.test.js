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
  assert.deepEqual(rechnungsSummen(beispielRechnung.positionen), { netto: 15310, ust: 2909, brutto: 18219, gruppen: [{ satz: 19, netto: 15310, ust: 2909 }] });
});

test('Gemischte Steuersätze: 95,00 zu 19 % und 2 x 24,90 Futter zu 7 %', () => {
  // 19 %: 95,00 -> 18,05. 7 %: 49,80 -> 3,486 -> 3,49. Netto 144,80, USt 21,54, brutto 166,34.
  const positionen = [
    { menge: 1, einzelpreisCent: 9500, ustSatz: 19 },
    { menge: 2, einzelpreisCent: 2490, ustSatz: 7 },
  ];
  assert.deepEqual(rechnungsSummen(positionen), {
    netto: 14480,
    ust: 2154,
    brutto: 16634,
    gruppen: [
      { satz: 19, netto: 9500, ust: 1805 },
      { satz: 7, netto: 4980, ust: 349 },
    ],
  });
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

test('Monatssummen: Storno hebt die Rechnung auf, offen zählt nur Unbezahltes', async () => {
  const { monatsSummen, statusArt } = await import('../js/rechnen.js');
  const pos = (cent) => [{ menge: 1, einzelpreisCent: cent }];
  const rechnungen = [
    // Oktober: 100,00 netto bezahlt -> 119,00 brutto
    { nr: 'RE-1', typ: 'rechnung', datum: '2026-10-05', bezahlt: true, positionen: pos(10000) },
    // November: 200,00 netto offen -> 238,00; 50,00 netto storniert -> 59,50; Storno dazu -> -59,50
    { nr: 'RE-2', typ: 'rechnung', datum: '2026-11-02', bezahlt: false, positionen: pos(20000) },
    { nr: 'RE-3', typ: 'rechnung', datum: '2026-11-03', bezahlt: false, storniertDurch: 'ST-1', positionen: pos(5000) },
    { nr: 'ST-1', typ: 'storno', datum: '2026-11-04', bezahlt: false, bezugNr: 'RE-3', positionen: pos(5000) },
    // November: 10,00 netto, später per Überweisung bezahlt -> 11,90
    { nr: 'RE-4', typ: 'rechnung', datum: '2026-11-10', bezahlt: false, eingang: { datum: '2026-11-12', zahlart: 'ueberweisung' }, positionen: pos(1000) },
  ];
  assert.deepEqual(rechnungen.map(statusArt), ['bezahlt', 'offen', 'storniert', 'storno', 'bezahlt']);
  assert.deepEqual(monatsSummen(rechnungen), [
    // 200 + 50 - 50 + 10 = 210,00 netto; USt 38,00 + 9,50 - 9,50 + 1,90 = 39,90; brutto 249,90; offen 238,00
    { monat: '2026-11', anzahl: 4, netto: 21000, ust: 3990, brutto: 24990, offen: 23800 },
    { monat: '2026-10', anzahl: 1, netto: 10000, ust: 1900, brutto: 11900, offen: 0 },
  ]);
});
