// Verschlüsselter Speicher im Browser (IndexedDB).
// Die Daten werden mit einem zufälligen Datenschlüssel verschlüsselt (AES-GCM). Dieser Schlüssel liegt
// zweimal verpackt vor: einmal mit dem Passwort, einmal mit dem Wiederherstellungscode.

const DB_NAME = 'hufschmied-test';
const PBKDF2_RUNDEN = 310000;
const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let datenSchluessel = null;

function db() {
  return new Promise((ok, fehler) => {
    const anfrage = indexedDB.open(DB_NAME, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore('kv');
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

async function lesen(schluessel) {
  const d = await db();
  return new Promise((ok, fehler) => {
    const a = d.transaction('kv').objectStore('kv').get(schluessel);
    a.onsuccess = () => ok(a.result);
    a.onerror = () => fehler(a.error);
  });
}

async function schreiben(eintraege) {
  const d = await db();
  return new Promise((ok, fehler) => {
    const t = d.transaction('kv', 'readwrite');
    for (const [schluessel, wert] of Object.entries(eintraege)) t.objectStore('kv').put(wert, schluessel);
    t.oncomplete = () => ok();
    t.onerror = () => fehler(t.error);
  });
}

function b64(bytes) {
  let text = '';
  for (const b of new Uint8Array(bytes)) text += String.fromCharCode(b);
  return btoa(text);
}
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const zufall = (n) => crypto.getRandomValues(new Uint8Array(n));

async function schluesselAus(geheimnis, salz) {
  const roh = await crypto.subtle.importKey('raw', new TextEncoder().encode(geheimnis), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salz, iterations: PBKDF2_RUNDEN, hash: 'SHA-256' }, roh, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

async function verpacken(geheimnis) {
  const salz = zufall(16);
  const iv = zufall(12);
  const verpackt = await crypto.subtle.wrapKey('raw', datenSchluessel, await schluesselAus(geheimnis, salz), { name: 'AES-GCM', iv });
  return { salz: b64(salz), iv: b64(iv), schluessel: b64(verpackt) };
}

async function auspacken(geheimnis, paket) {
  return crypto.subtle.unwrapKey('raw', unb64(paket.schluessel), await schluesselAus(geheimnis, unb64(paket.salz)), { name: 'AES-GCM', iv: unb64(paket.iv) }, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

function neuerCode() {
  const zeichen = Array.from(zufall(20), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('');
  return zeichen.match(/.{5}/g).join('-');
}

const codeNormal = (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function verschluesseln(daten) {
  const iv = zufall(12);
  const geheim = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, datenSchluessel, new TextEncoder().encode(JSON.stringify(daten)));
  return { iv: b64(iv), inhalt: geheim };
}

async function entschluesseln(paket) {
  const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(paket.iv) }, datenSchluessel, paket.inhalt);
  return JSON.parse(new TextDecoder().decode(klar));
}

export async function istEingerichtet() {
  return Boolean(await lesen('schloss'));
}

export function istOffen() {
  return datenSchluessel !== null;
}

export function sperren() {
  datenSchluessel = null;
}

// Erster Start: Passwort festlegen. Gibt den Wiederherstellungscode zurück, der nur jetzt angezeigt wird.
export async function einrichten(passwort, startDaten) {
  datenSchluessel = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const code = neuerCode();
  await schreiben({
    schloss: { passwort: await verpacken(passwort), code: await verpacken(codeNormal(code)) },
    daten: await verschluesseln(startDaten),
  });
  return code;
}

export async function oeffnen(passwort) {
  const schloss = await lesen('schloss');
  try {
    datenSchluessel = await auspacken(passwort, schloss.passwort);
  } catch {
    datenSchluessel = null;
    return null;
  }
  return entschluesseln(await lesen('daten'));
}

export async function speichern(daten) {
  await schreiben({ daten: await verschluesseln(daten) });
}

export async function passwortAendern(altesPasswort, neuesPasswort) {
  const schloss = await lesen('schloss');
  try {
    await auspacken(altesPasswort, schloss.passwort);
  } catch {
    return false;
  }
  await schreiben({ schloss: { ...schloss, passwort: await verpacken(neuesPasswort) } });
  return true;
}

// Passwort vergessen: mit dem Wiederherstellungscode ein neues Passwort setzen. Es gibt danach einen neuen Code.
export async function zuruecksetzen(code, neuesPasswort) {
  const schloss = await lesen('schloss');
  try {
    datenSchluessel = await auspacken(codeNormal(code), schloss.code);
  } catch {
    datenSchluessel = null;
    return null;
  }
  const neu = neuerCode();
  await schreiben({ schloss: { passwort: await verpacken(neuesPasswort), code: await verpacken(codeNormal(neu)) } });
  return { code: neu, daten: await entschluesseln(await lesen('daten')) };
}

// Sicherungsdatei: enthält dieselben verschlüsselten Daten wie der Browser. Ohne Passwort oder Code nicht lesbar.
export async function sicherungErzeugen() {
  const daten = await lesen('daten');
  return JSON.stringify({ format: 'hufschmied-sicherung-1', erstellt: new Date().toISOString(), schloss: await lesen('schloss'), daten: { iv: daten.iv, inhalt: b64(daten.inhalt) } });
}

export async function sicherungEinspielen(text, passwort) {
  const s = JSON.parse(text);
  if (s.format !== 'hufschmied-sicherung-1') throw new Error('Das ist keine Sicherungsdatei dieses Programms.');
  const vorher = datenSchluessel;
  try {
    datenSchluessel = await auspacken(passwort, s.schloss.passwort);
  } catch {
    datenSchluessel = vorher;
    return null;
  }
  const paket = { iv: s.daten.iv, inhalt: unb64(s.daten.inhalt).buffer };
  const daten = await entschluesseln(paket);
  await schreiben({ schloss: s.schloss, daten: paket });
  return daten;
}

export async function allesLoeschen() {
  datenSchluessel = null;
  const d = await db();
  return new Promise((ok, fehler) => {
    const t = d.transaction('kv', 'readwrite');
    t.objectStore('kv').clear();
    t.oncomplete = () => ok();
    t.onerror = () => fehler(t.error);
  });
}
