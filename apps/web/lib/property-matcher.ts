import { eq } from 'drizzle-orm';
import stringSimilarity from 'string-similarity';
import { properties, type Database } from '@premura/db';

// Property matcher: dato un property_name letto da un'email Airbnb (es.
// "[Jacuzzi - Centro Storico] La goccia di S.Gennaro"), trova la riga
// properties.id corrispondente per host_id.
//
// Strategia:
//   1. Carica tutte le properties dell'host (set tipicamente 1-5 righe).
//   2. Normalizza i nomi (lowercase, rimuove diacritici/punteggiatura).
//   3. Calcola similarity con string-similarity (Dice's coefficient).
//      Boost +0.2 se il nome property è SUBSTRING del nome email
//      (es. "La Goccia" è dentro "[...] La goccia di S.Gennaro").
//   4. Ritorna match con confidence ≥ threshold (default 0.5 dopo boost,
//      coerente con il caso "La Goccia" → "La goccia di S.Gennaro" che
//      è ~0.55 di Dice + 0.2 boost = 0.75).

const DEFAULT_THRESHOLD = 0.5;
const SUBSTRING_BOOST = 0.2;

export type PropertyMatchResult = {
  propertyId: string;
  propertyName: string;
  confidence: number;
};

export async function matchProperty(
  db: Database,
  hostId: string,
  emailPropertyName: string,
  options: { threshold?: number } = {},
): Promise<PropertyMatchResult | null> {
  if (!emailPropertyName || emailPropertyName.trim() === '') return null;

  const rows = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(eq(properties.hostId, hostId));

  if (rows.length === 0) return null;

  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const target = normalize(emailPropertyName);

  let best: PropertyMatchResult | null = null;
  for (const row of rows) {
    const candidate = normalize(row.name);
    let score = stringSimilarity.compareTwoStrings(target, candidate);
    // Boost se il nome candidate (es. "la goccia") appare come substring
    // del target (es. "[jacuzzi centro storico] la goccia di sgennaro").
    if (candidate.length >= 4 && target.includes(candidate)) {
      score = Math.min(1, score + SUBSTRING_BOOST);
    }
    if (!best || score > best.confidence) {
      best = { propertyId: row.id, propertyName: row.name, confidence: score };
    }
  }

  if (!best || best.confidence < threshold) return null;
  return best;
}

// Normalizza per match: lowercase, NFKD per stripare diacritici,
// rimuove punteggiatura/parentesi, comprime spazi.
function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/[\[\](){}.,;:!?\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const _internals = {
  normalize,
  DEFAULT_THRESHOLD,
  SUBSTRING_BOOST,
};
