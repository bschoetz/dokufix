// Der Prototyp leser.mjs als Umgebung: parseXml() wirft bei kaputtem XML,
// lesen() zählt das als Parserfehler.
import { parseXml } from '../leser.mjs';

export const name = 'leser';
export const info = 'leser.mjs (Prototyp, ohne Abhängigkeit)';
export const parse = xml => parseXml(xml);
