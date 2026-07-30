// Import da LINK dell'annuncio: Premura PROVA a leggere la pagina.
// Booking/Airbnb bloccano quasi sempre i datacenter (verificato da
// Andrea): il blocco e' il caso NORMALE, non un errore. Chi chiama
// riceve 'blocked' e la UI propone la strada che funziona sempre —
// "apri la pagina, Ctrl+A, copia e incolla qui" — senza mai mostrare
// un vicolo cieco all'host.

export type ListingPageResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'invalid_url' | 'blocked' };

/** Testo leggibile da una pagina HTML: via script/style/tag, entita' base. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sotto questa soglia la pagina e' quasi certamente una shell
// JavaScript o una pagina di blocco: per l'estrazione vale zero,
// meglio il fallback guidato che un form precompilato dal nulla.
const MIN_USEFUL_TEXT = 400;

export async function fetchListingPageText(rawUrl: string): Promise<ListingPageResult> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocollo');
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Premura/1.0 (import annuncio su richiesta dell’host)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, reason: 'blocked' };
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return { ok: false, reason: 'blocked' };

    // Cap di lettura: 2 MB bastano per qualsiasi annuncio.
    const html = (await res.text()).slice(0, 2_000_000);
    const text = htmlToText(html);
    if (text.length < MIN_USEFUL_TEXT) return { ok: false, reason: 'blocked' };
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'blocked' };
  }
}
