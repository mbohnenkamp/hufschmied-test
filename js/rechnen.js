// Rechenregeln. Alle Geldbeträge werden intern in Cent (ganze Zahlen) geführt.

export const UST_SATZ = 19;
export const UST_SAETZE = [19, 7];
// Ältere Positionen ohne Angabe gelten als 19 %.
export const ustSatzVon = (p) => p.ustSatz ?? UST_SATZ;

export function euroZuCent(eingabe) {
  const text = String(eingabe).trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const zahl = Number(text);
  if (text === '' || !Number.isFinite(zahl)) return null;
  return Math.round(zahl * 100);
}

export function centZuText(cent) {
  const vorzeichen = cent < 0 ? '-' : '';
  const betrag = Math.abs(cent);
  const euro = String(Math.floor(betrag / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${vorzeichen}${euro},${String(betrag % 100).padStart(2, '0')}`;
}

export function centZuDezimal(cent) {
  return (cent / 100).toFixed(2);
}

// Menge darf Nachkommastellen haben (z. B. 1,5 Stunden), der Zeilenbetrag wird auf Cent gerundet.
export function zeilenNetto(menge, einzelpreisCent) {
  return Math.round(menge * einzelpreisCent);
}

// Die Umsatzsteuer wird je Steuersatz auf die Nettosumme gerechnet, nicht je Zeile (so verlangt es EN 16931).
export function rechnungsSummen(positionen) {
  const gruppen = UST_SAETZE.map((satz) => {
    const netto = positionen.filter((p) => ustSatzVon(p) === satz).reduce((summe, p) => summe + zeilenNetto(p.menge, p.einzelpreisCent), 0);
    return { satz, netto, ust: Math.round((netto * satz) / 100) };
  }).filter((g) => g.netto !== 0);
  const netto = gruppen.reduce((s, g) => s + g.netto, 0);
  const ust = gruppen.reduce((s, g) => s + g.ust, 0);
  return { netto, ust, brutto: netto + ust, gruppen };
}

export function naechsteNummer(kuerzel, jahr, vorhandeneNummern) {
  const anfang = `${kuerzel}-${jahr}-`;
  const hoechste = vorhandeneNummern
    .filter((n) => n.startsWith(anfang))
    .reduce((max, n) => Math.max(max, Number(n.slice(anfang.length)) || 0), 0);
  return `${anfang}${String(hoechste + 1).padStart(4, '0')}`;
}

export function heute() {
  return datumAlsText(new Date());
}

// Nie toISOString() verwenden: das liefert den UTC-Tag, nicht den Tag in Deutschland.
export function datumAlsText(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function datumDeutsch(iso) {
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

export function tagePlus(iso, tage) {
  const [j, m, t] = iso.split('-').map(Number);
  return datumAlsText(new Date(j, m - 1, t + tage));
}

// Kassenbuch: stornierte Einträge bleiben sichtbar, zählen aber nicht mit.
export function kassenVorzeichen(eintrag) {
  if (eintrag.storniert) return 0;
  return eintrag.art === 'einnahme' ? eintrag.betragCent : -eintrag.betragCent;
}

export function kassenMonat(eintraege, monat) {
  const sortiert = [...eintraege].sort((a, b) => a.datum.localeCompare(b.datum) || a.nr - b.nr);
  const anfang = sortiert.filter((e) => e.datum.slice(0, 7) < monat).reduce((s, e) => s + kassenVorzeichen(e), 0);
  let saldo = anfang;
  let einnahmen = 0;
  let ausgaben = 0;
  const zeilen = sortiert
    .filter((e) => e.datum.slice(0, 7) === monat)
    .map((e) => {
      saldo += kassenVorzeichen(e);
      if (!e.storniert && e.art === 'einnahme') einnahmen += e.betragCent;
      if (!e.storniert && e.art === 'ausgabe') ausgaben += e.betragCent;
      return { ...e, saldo };
    });
  return { anfang, einnahmen, ausgaben, ende: saldo, zeilen };
}

export function kassenBestand(eintraege) {
  return eintraege.reduce((s, e) => s + kassenVorzeichen(e), 0);
}

// Rechnungsübersicht. Eine Stornorechnung zählt negativ, die stornierte Rechnung bleibt positiv stehen:
// zusammen ergeben beide 0.
export function statusArt(r) {
  if (r.typ === 'storno') return 'storno';
  if (r.storniertDurch) return 'storniert';
  if (r.bezahlt || r.eingang) return 'bezahlt';
  return 'offen';
}

export function betraege(r) {
  const s = rechnungsSummen(r.positionen);
  const vz = r.typ === 'storno' ? -1 : 1;
  return { netto: vz * s.netto, ust: vz * s.ust, brutto: vz * s.brutto };
}

export function summeBetraege(rechnungen) {
  return rechnungen.reduce(
    (summe, r) => {
      const b = betraege(r);
      return { netto: summe.netto + b.netto, ust: summe.ust + b.ust, brutto: summe.brutto + b.brutto, offen: summe.offen + (statusArt(r) === 'offen' ? b.brutto : 0) };
    },
    { netto: 0, ust: 0, brutto: 0, offen: 0 },
  );
}

// Je Monat des Rechnungsdatums, neuester Monat zuerst.
export function monatsSummen(rechnungen) {
  const monate = [...new Set(rechnungen.map((r) => r.datum.slice(0, 7)))].sort().reverse();
  return monate.map((monat) => {
    const liste = rechnungen.filter((r) => r.datum.slice(0, 7) === monat);
    return { monat, anzahl: liste.length, ...summeBetraege(liste) };
  });
}
