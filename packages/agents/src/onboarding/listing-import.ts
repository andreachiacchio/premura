import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Wizard "Aggiungi struttura" — import da annuncio esistente.
//
// L'host INCOLLA il testo del proprio annuncio Booking/Airbnb, oppure
// carica 2-3 screenshot. Niente scraping server-side delle piattaforme:
// bloccano i datacenter e lo vietano nei ToS — la fonte la porta l'host,
// che l'annuncio e' suo. Claude estrae i campi e il wizard li precompila:
// l'host CORREGGE, non scrive.
//
// Regola non negoziabile: MAI inventare. Un campo non presente nella
// fonte resta vuoto — un campo vuoto l'host lo compila, un campo
// inventato lo firma senza accorgersene.
//
// Model: primario (vision sugli screenshot + annunci multilingua; e' un
// gesto raro, una volta per struttura — la qualita' vale il costo).

const MODEL = process.env.CLAUDE_MODEL_LISTING_IMPORT ?? process.env.CLAUDE_MODEL_PRIMARY ?? '';
export const LISTING_IMPORT_VERSION = '2026-07-30-v1';

// Il JSON che il wizard precompila. Tutto nullable per design: il
// modello emette solo cio' che legge, il resto resta da compilare.
export type ListingImportData = {
  nome: string | null;
  citta: string | null;
  indirizzoIpotizzato: string | null;
  tipo: string | null;
  postiLetto: number | null;
  descrizione: string | null;
  dotazioni: string[];
  regole: string[];
  checkin: string | null;
  checkout: string | null;
  quartiere: string | null;
  lingua: string | null;
};

const extractionSchema = z.object({
  nome: z.string().min(1).max(255).optional(),
  citta: z.string().min(1).max(128).optional(),
  indirizzo_ipotizzato: z.string().min(1).max(500).optional(),
  tipo: z.string().min(1).max(80).optional(),
  posti_letto: z.number().int().min(1).max(50).optional(),
  descrizione: z.string().min(1).max(4000).optional(),
  dotazioni: z.array(z.string().min(1).max(120)).max(60).optional(),
  regole: z.array(z.string().min(1).max(300)).max(30).optional(),
  checkin: z.string().min(1).max(120).optional(),
  checkout: z.string().min(1).max(120).optional(),
  quartiere: z.string().min(1).max(160).optional(),
  lingua: z.string().min(2).max(8).optional(),
});

/**
 * Da output del tool (campi opzionali) alla forma che il wizard usa
 * (campi sempre presenti, null/[] quando mancano). Pura: e' il punto
 * dove "mai inventare" diventa una proprieta' verificabile nei test.
 */
export function normalizeListingExtraction(raw: unknown): ListingImportData {
  const parsed = extractionSchema.parse(raw);
  return {
    nome: parsed.nome ?? null,
    citta: parsed.citta ?? null,
    indirizzoIpotizzato: parsed.indirizzo_ipotizzato ?? null,
    tipo: parsed.tipo ?? null,
    postiLetto: parsed.posti_letto ?? null,
    descrizione: parsed.descrizione ?? null,
    dotazioni: parsed.dotazioni ?? [],
    regole: parsed.regole ?? [],
    checkin: parsed.checkin ?? null,
    checkout: parsed.checkout ?? null,
    quartiere: parsed.quartiere ?? null,
    lingua: parsed.lingua ?? null,
  };
}

const SYSTEM_PROMPT = `Sei l'assistente di Premura specializzato nell'estrazione strutturata di dati da annunci di case vacanza (Booking.com, Airbnb e simili).

L'host ti fornisce IL PROPRIO annuncio: come testo incollato, oppure come screenshot. Tuo compito: estrarre i campi ammessi e nient'altro.

REGOLA ASSOLUTA: MAI inventare, MAI dedurre oltre il testo. Se un campo non e' chiaramente presente nella fonte, NON emetterlo. Un campo vuoto verra' compilato dall'host; un campo inventato e' un danno.

CAMPI (tool emit_listing_extraction, tutti opzionali):
- nome: il titolo/nome della struttura come appare nell'annuncio
- citta: la citta'
- indirizzo_ipotizzato: indirizzo o zona SE presente nell'annuncio (spesso e' parziale: va bene cosi', si chiama "ipotizzato" perche' l'host lo verifichera')
- tipo: tipologia dichiarata (appartamento, villa, b&b, camera...)
- posti_letto: numero di posti letto o ospiti massimi, SOLO se scritto
- descrizione: la descrizione testuale dell'annuncio (riportala fedele, puoi accorciare se ripetitiva, mai riscrivere con parole tue)
- dotazioni: lista servizi/dotazioni elencati (wifi, jacuzzi, aria condizionata...)
- regole: regole della casa elencate (no fumo, no feste, orari silenzio...)
- checkin / checkout: orari o finestre come scritti (es. "15:00-20:00", "entro le 10:00")
- quartiere: quartiere/zona se nominati (es. "Centro Storico", "Duomo")
- lingua: codice della lingua predominante dell'annuncio (es. "it", "en")

Dagli screenshot leggi solo cio' che si vede. Testo tagliato o illeggibile = campo non presente.`;

type ScreenshotInput = {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  base64: string;
};

export type ListingImportInput = {
  /** Testo dell'annuncio incollato dall'host. */
  text?: string;
  /** Screenshot dell'annuncio (max 3). */
  images?: ScreenshotInput[];
};

export type ListingImportResult = {
  data: ListingImportData;
  costUsd: number;
  agentVersion: string;
};

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'emit_listing_extraction',
  description:
    "Emette i campi estratti dall'annuncio. Tutti opzionali — emetti solo quelli effettivamente presenti nella fonte.",
  input_schema: {
    type: 'object',
    properties: {
      nome: { type: 'string' },
      citta: { type: 'string' },
      indirizzo_ipotizzato: { type: 'string' },
      tipo: { type: 'string' },
      posti_letto: { type: 'number' },
      descrizione: { type: 'string' },
      dotazioni: { type: 'array', items: { type: 'string' } },
      regole: { type: 'array', items: { type: 'string' } },
      checkin: { type: 'string' },
      checkout: { type: 'string' },
      quartiere: { type: 'string' },
      lingua: { type: 'string' },
    },
  },
};

export async function extractListingData(input: ListingImportInput): Promise<ListingImportResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  if (!MODEL) throw new Error('CLAUDE_MODEL_PRIMARY not configured');
  const text = input.text?.trim() ?? '';
  const images = input.images ?? [];
  if (!text && images.length === 0) {
    throw new Error('extractListingData: serve testo o almeno uno screenshot');
  }
  if (images.length > 3) {
    throw new Error('extractListingData: massimo 3 screenshot');
  }
  const client = new Anthropic({ apiKey });

  // Limite input per costo + safety: ~20K char (~5K token).
  const truncated = text.length > 20000 ? `${text.slice(0, 20000)}\n[...troncato]` : text;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    });
  }
  content.push({
    type: 'text',
    text: truncated
      ? `Estrai i campi da questo annuncio:\n\n---\n${truncated}\n---`
      : 'Estrai i campi da questi screenshot del mio annuncio.',
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'emit_listing_extraction' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('extractListingData: no tool_use in response');
  }

  // Prezzi modello primario (vedi packages/shared/src/claude.ts).
  const costUsd =
    (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1_000_000;

  return {
    data: normalizeListingExtraction(toolUse.input),
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    agentVersion: LISTING_IMPORT_VERSION,
  };
}
