import { readFileSync } from 'node:fs';
import * as PDFLib from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const datei = (name) => new Uint8Array(readFileSync(new URL(`../vendor/${name}`, import.meta.url)));

export const lib = {
  PDFLib,
  fontkit,
  schrift: datei('DejaVuSans.ttf'),
  schriftFett: datei('DejaVuSans-Bold.ttf'),
  icc: datei('sRGB-v2-micro.icc'),
};

export const betrieb = {
  name: 'Max Mustermann',
  strasse: 'Musterstrasse 2',
  plz: '00000',
  ort: 'Musterstadt',
  ustId: 'DE123456789',
  steuernummer: '',
  iban: 'DE02 1203 0000 0000 2020 51',
  bank: 'Musterbank',
  email: 'max@example.com',
  telefon: '',
};

export const beispielRechnung = {
  nr: 'RE-2026-0001',
  typ: 'rechnung',
  datum: '2026-11-19',
  leistungsdatum: '2026-11-18',
  faelligAm: '2026-12-03',
  zahlart: 'ueberweisung',
  bezahlt: false,
  kunde: { name: 'MA 1', firma: 'Reitstall Muster GmbH', strasse: 'Stallweg 1', plz: '00000', ort: 'Musterstadt', email: 'stall@example.com' },
  positionen: [
    { bezeichnung: 'Beschlag, 4 Eisen', menge: 1, einheit: 'C62', einzelpreisCent: 9500 },
    { bezeichnung: 'Stollen', menge: 4, einheit: 'C62', einzelpreisCent: 1250 },
    { bezeichnung: 'Anfahrt', menge: 18, einheit: 'KMT', einzelpreisCent: 45 },
  ],
};
