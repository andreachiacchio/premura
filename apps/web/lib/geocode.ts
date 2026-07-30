// Geocoding via Nominatim (OpenStreetMap). Usato dal wizard "Aggiungi
// struttura" DOPO che l'host ha confermato l'indirizzo: mai geocodificare
// un dato incerto. Le coordinate finiscono su properties.latitude/longitude
// e sono la base per mappa e POI della guest app.
//
// Policy Nominatim: max 1 req/s, User-Agent identificativo obbligatorio.
// Qui siamo largamente sotto (una chiamata per click dell'host).

export type GeocodeHit = {
  latitude: number;
  longitude: number;
  /** Indirizzo risolto per esteso, da mostrare all'host per conferma. */
  displayName: string;
};

export async function geocodeAddress(query: string): Promise<GeocodeHit | null> {
  const q = query.trim();
  if (!q) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'it');

  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Premura/1.0 (geocoding strutture host)' },
  });
  if (!res.ok) return null;

  const hits = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const first = hits[0];
  if (!first?.lat || !first?.lon || !first?.display_name) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude, displayName: first.display_name };
}
