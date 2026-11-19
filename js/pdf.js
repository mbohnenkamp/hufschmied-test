// PDF-Erzeugung. Läuft im Browser und in den Tests; die Bibliotheken werden deshalb übergeben:
// lib = { PDFLib, fontkit, schrift, schriftFett, icc }
import { centZuText, datumDeutsch, rechnungsSummen, zeilenNetto, kassenMonat, UST_SATZ } from './rechnen.js';
import { zugferdXml, zahlungsText, kundenName, EINHEITEN } from './zugferd.js';

const RAND = 56;
const BREITE = 595.28;
const HOEHE = 841.89;

function xmp(titel, autor, zeit) {
  const x = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${x(titel)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${x(autor)}</rdf:li></rdf:Seq></dc:creator></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>Hufschmied-Testversion</pdf:Producer></rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>Hufschmied-Testversion</xmp:CreatorTool><xmp:CreateDate>${zeit}</xmp:CreateDate><xmp:ModifyDate>${zeit}</xmp:ModifyDate></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Name der eingebetteten XML-Datei</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Version des Factur-X-Schemas</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Profil der Factur-X-Daten</pdfaProperty:description></rdf:li>
</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

async function neuesDokument(lib, titel, autor) {
  const doc = await lib.PDFLib.PDFDocument.create();
  doc.registerFontkit(lib.fontkit);
  const normal = await doc.embedFont(lib.schrift, { subset: true });
  const fett = await doc.embedFont(lib.schriftFett, { subset: true });
  const jetzt = new Date();
  jetzt.setMilliseconds(0);
  doc.setTitle(titel);
  doc.setAuthor(autor);
  doc.setProducer('Hufschmied-Testversion');
  doc.setCreator('Hufschmied-Testversion');
  doc.setCreationDate(jetzt);
  doc.setModificationDate(jetzt);
  return { doc, normal, fett, jetzt };
}

function zeichner(lib, doc, normal, fett) {
  const grau = lib.PDFLib.rgb(0.35, 0.35, 0.35);
  const schwarz = lib.PDFLib.rgb(0, 0, 0);
  const z = {
    seite: doc.addPage([BREITE, HOEHE]),
    y: HOEHE - RAND,
    text(t, xPos, opt = {}) {
      const font = opt.fett ? fett : normal;
      const size = opt.size ?? 10;
      const inhalt = String(t);
      const breite = font.widthOfTextAtSize(inhalt, size);
      const start = opt.rechts ? xPos - breite : xPos;
      z.seite.drawText(inhalt, { x: start, y: opt.y ?? z.y, size, font, color: opt.grau ? grau : schwarz });
    },
    linie(yPos = z.y) {
      z.seite.drawLine({ start: { x: RAND, y: yPos }, end: { x: BREITE - RAND, y: yPos }, thickness: 0.5, color: grau });
    },
    umbruch(text, maxBreite, size = 10) {
      const zeilen = [];
      let aktuell = '';
      for (const wort of String(text).split(/\s+/)) {
        const probe = aktuell ? `${aktuell} ${wort}` : wort;
        if (normal.widthOfTextAtSize(probe, size) > maxBreite && aktuell) {
          zeilen.push(aktuell);
          aktuell = wort;
        } else aktuell = probe;
      }
      if (aktuell) zeilen.push(aktuell);
      return zeilen;
    },
    neueSeiteWennNoetig(platz) {
      if (z.y - platz > RAND + 40) return false;
      z.seite = doc.addPage([BREITE, HOEHE]);
      z.y = HOEHE - RAND;
      return true;
    },
  };
  return z;
}

function fusszeile(z, doc, betrieb) {
  const teile = [
    `${betrieb.name} · ${betrieb.strasse} · ${betrieb.plz} ${betrieb.ort}`,
    [betrieb.ustId && `USt-IdNr. ${betrieb.ustId}`, betrieb.steuernummer && `Steuernummer ${betrieb.steuernummer}`, betrieb.iban && `IBAN ${betrieb.iban}`, betrieb.bank]
      .filter(Boolean)
      .join(' · '),
  ];
  doc.getPages().forEach((seite, i, alle) => {
    z.seite = seite;
    z.linie(RAND + 30);
    z.text(teile[0], RAND, { y: RAND + 18, size: 8, grau: true });
    z.text(teile[1], RAND, { y: RAND + 7, size: 8, grau: true });
    z.text(`Seite ${i + 1} von ${alle.length}`, BREITE - RAND, { y: RAND + 18, size: 8, grau: true, rechts: true });
  });
}

export function rechnungsDateiname(rechnung) {
  return `${rechnung.typ === 'storno' ? 'Stornorechnung' : 'Rechnung'}_${rechnung.nr}.pdf`;
}

export async function rechnungPdf(lib, rechnung, betrieb) {
  const { PDFName, PDFString, PDFHexString, AFRelationship } = lib.PDFLib;
  const istStorno = rechnung.typ === 'storno';
  const titel = `${istStorno ? 'Stornorechnung' : 'Rechnung'} ${rechnung.nr}`;
  const { doc, normal, fett, jetzt } = await neuesDokument(lib, titel, betrieb.name);
  const z = zeichner(lib, doc, normal, fett);
  const rechts = BREITE - RAND;
  const summen = rechnungsSummen(rechnung.positionen);
  const vz = istStorno ? -1 : 1;

  z.text(betrieb.name, RAND, { fett: true, size: 16 });
  z.text('Hufschmied', RAND, { y: z.y - 16, grau: true });
  [betrieb.strasse, `${betrieb.plz} ${betrieb.ort}`, betrieb.telefon, betrieb.email].filter(Boolean).forEach((t, i) => z.text(t, rechts, { y: z.y - i * 13, rechts: true, size: 9 }));

  z.y -= 90;
  z.text(`${betrieb.name} · ${betrieb.strasse} · ${betrieb.plz} ${betrieb.ort}`, RAND, { size: 7, grau: true });
  z.y -= 16;
  const k = rechnung.kunde;
  [k.firma, k.name, k.strasse, `${k.plz} ${k.ort}`].filter(Boolean).forEach((t) => {
    z.text(t, RAND, { size: 11 });
    z.y -= 15;
  });

  z.y -= 40;
  z.text(titel, RAND, { fett: true, size: 15 });
  const kopf = [
    ['Rechnungsdatum', datumDeutsch(rechnung.datum)],
    ['Leistungsdatum', datumDeutsch(rechnung.leistungsdatum)],
  ];
  if (istStorno) kopf.push(['Zur Rechnung', rechnung.bezugNr]);
  kopf.forEach(([a, b], i) => {
    z.text(a, rechts - 85, { y: z.y + 13 - i * 13, rechts: true, size: 9, grau: true });
    z.text(b, rechts, { y: z.y + 13 - i * 13, rechts: true, size: 9 });
  });

  z.y -= 44;
  const spalten = { pos: RAND, text: RAND + 28, menge: 345, einzel: 440, gesamt: rechts };
  const tabellenKopf = () => {
    z.text('Pos.', spalten.pos, { fett: true, size: 9 });
    z.text('Leistung', spalten.text, { fett: true, size: 9 });
    z.text('Menge', spalten.menge, { fett: true, size: 9, rechts: true });
    z.text('Einzelpreis €', spalten.einzel, { fett: true, size: 9, rechts: true });
    z.text('Netto €', spalten.gesamt, { fett: true, size: 9, rechts: true });
    z.y -= 6;
    z.linie();
    z.y -= 15;
  };
  tabellenKopf();
  rechnung.positionen.forEach((p, i) => {
    const zeilen = z.umbruch(p.bezeichnung, 215);
    if (z.neueSeiteWennNoetig(zeilen.length * 13 + 10)) tabellenKopf();
    z.text(i + 1, spalten.pos);
    z.text(`${String(p.menge).replace('.', ',')} ${EINHEITEN[p.einheit]}`, spalten.menge, { rechts: true });
    z.text(centZuText(p.einzelpreisCent), spalten.einzel, { rechts: true });
    z.text(centZuText(vz * zeilenNetto(p.menge, p.einzelpreisCent)), spalten.gesamt, { rechts: true });
    zeilen.forEach((t) => {
      z.text(t, spalten.text);
      z.y -= 13;
    });
    z.y -= 5;
  });

  z.neueSeiteWennNoetig(120);
  z.linie(z.y + 8);
  z.y -= 8;
  [
    ['Summe netto', summen.netto, false],
    [`Umsatzsteuer ${UST_SATZ} %`, summen.ust, false],
    ['Rechnungsbetrag', summen.brutto, true],
  ].forEach(([name, cent, stark]) => {
    z.text(name, spalten.einzel, { rechts: true, fett: stark, size: stark ? 11 : 10 });
    z.text(`${centZuText(vz * cent)} €`, spalten.gesamt, { rechts: true, fett: stark, size: stark ? 11 : 10 });
    z.y -= stark ? 0 : 15;
  });

  z.y -= 40;
  z.text(zahlungsText(rechnung), RAND);
  if (!istStorno && !rechnung.bezahlt && rechnung.zahlart === 'ueberweisung' && betrieb.iban) {
    z.umbruch(`Bitte überweisen Sie auf IBAN ${betrieb.iban}${betrieb.bank ? `, ${betrieb.bank}` : ''}. Verwendungszweck: ${rechnung.nr}`, BREITE - 2 * RAND).forEach((t) => {
      z.y -= 15;
      z.text(t, RAND);
    });
  }
  if (rechnung.hinweis) {
    z.y -= 22;
    z.umbruch(rechnung.hinweis, BREITE - 2 * RAND).forEach((t) => {
      z.text(t, RAND);
      z.y -= 13;
    });
  }
  fusszeile(z, doc, betrieb);

  // Ab hier: PDF/A-3 mit eingebetteter XML-Datei (ZUGFeRD).
  const xml = new TextEncoder().encode(zugferdXml(rechnung, betrieb));
  await doc.attach(xml, 'factur-x.xml', {
    mimeType: 'text/xml',
    description: 'Factur-X/ZUGFeRD-Rechnungsdaten',
    creationDate: jetzt,
    modificationDate: jetzt,
    afRelationship: AFRelationship.Alternative,
  });

  const ctx = doc.context;
  const profil = ctx.register(ctx.stream(lib.icc, { N: 3 }));
  const ausgabe = ctx.register(
    ctx.obj({
      Type: 'OutputIntent',
      S: 'GTS_PDFA1',
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      Info: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: profil,
    }),
  );
  doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ausgabe]));

  const metadaten = ctx.register(ctx.stream(xmp(titel, betrieb.name, jetzt.toISOString().replace('.000Z', 'Z')), { Type: 'Metadata', Subtype: 'XML' }));
  doc.catalog.set(PDFName.of('Metadata'), metadaten);

  const kennung = PDFHexString.of(Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));
  ctx.trailerInfo.ID = ctx.obj([kennung, kennung]);

  return doc.save({ useObjectStreams: false });
}

export function monatsName(monat) {
  const namen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const [jahr, m] = monat.split('-');
  return `${namen[Number(m) - 1]} ${jahr}`;
}

export async function kassenbuchPdf(lib, monat, eintraege, betrieb) {
  const titel = `Kassenbuch ${monatsName(monat)}`;
  const { doc, normal, fett } = await neuesDokument(lib, titel, betrieb.name);
  const z = zeichner(lib, doc, normal, fett);
  const rechts = BREITE - RAND;
  const m = kassenMonat(eintraege, monat);
  const spalten = { nr: RAND, datum: RAND + 30, text: RAND + 90, ein: 400, aus: 465, saldo: rechts };

  z.text(titel, RAND, { fett: true, size: 15 });
  z.text(`${betrieb.name}, ${betrieb.strasse}, ${betrieb.plz} ${betrieb.ort}`, RAND, { y: z.y - 16, size: 9, grau: true });
  z.y -= 44;

  const kopf = () => {
    z.text('Nr.', spalten.nr, { fett: true, size: 9 });
    z.text('Datum', spalten.datum, { fett: true, size: 9 });
    z.text('Buchungstext', spalten.text, { fett: true, size: 9 });
    z.text('Einnahme €', spalten.ein, { fett: true, size: 9, rechts: true });
    z.text('Ausgabe €', spalten.aus, { fett: true, size: 9, rechts: true });
    z.text('Bestand €', spalten.saldo, { fett: true, size: 9, rechts: true });
    z.y -= 6;
    z.linie();
    z.y -= 15;
  };
  kopf();
  z.text('Anfangsbestand', spalten.text, { size: 9 });
  z.text(centZuText(m.anfang), spalten.saldo, { size: 9, rechts: true });
  z.y -= 16;

  m.zeilen.forEach((e) => {
    const text = e.storniert ? `STORNIERT: ${e.text} (Grund: ${e.stornoGrund}, storniert am ${datumDeutsch(e.storniertAm)})` : e.text;
    const zeilen = z.umbruch(text, 235, 9);
    if (z.neueSeiteWennNoetig(zeilen.length * 12 + 8)) kopf();
    z.text(e.nr, spalten.nr, { size: 9, grau: e.storniert });
    z.text(datumDeutsch(e.datum), spalten.datum, { size: 9, grau: e.storniert });
    const betrag = e.storniert ? `(${centZuText(e.betragCent)})` : centZuText(e.betragCent);
    z.text(betrag, e.art === 'einnahme' ? spalten.ein : spalten.aus, { size: 9, rechts: true, grau: e.storniert });
    z.text(centZuText(e.saldo), spalten.saldo, { size: 9, rechts: true });
    zeilen.forEach((t) => {
      z.text(t, spalten.text, { size: 9, grau: e.storniert });
      z.y -= 12;
    });
    z.y -= 4;
  });

  z.neueSeiteWennNoetig(90);
  z.linie(z.y + 8);
  z.y -= 10;
  [
    ['Anfangsbestand', m.anfang],
    ['Summe Einnahmen', m.einnahmen],
    ['Summe Ausgaben', -m.ausgaben],
    ['Endbestand', m.ende],
  ].forEach(([name, cent], i) => {
    z.text(name, spalten.aus, { rechts: true, fett: i === 3 });
    z.text(`${centZuText(cent)} €`, spalten.saldo, { rechts: true, fett: i === 3 });
    z.y -= 15;
  });
  z.y -= 10;
  z.text('Stornierte Einträge stehen in Klammern und sind in den Summen nicht enthalten.', RAND, { size: 8, grau: true });
  fusszeile(z, doc, betrieb);
  return doc.save();
}
