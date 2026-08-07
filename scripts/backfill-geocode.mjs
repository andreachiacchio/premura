// Backfill coordinate delle strutture create prima del 07/08.
//
// Fino a oggi createProperty non geocodificava: le coordinate arrivavano
// solo dal bottone opzionale del wizard, che si puo' saltare. Chi l'ha
// saltato ha una struttura con la citta' compilata e latitude/longitude
// nulle — e senza coordinate non esistono i consigli locali generati
// dalla posizione.
//
// Uso:
//   DATABASE_URL=... node scripts/backfill-geocode.mjs           # DRY RUN
//   DATABASE_URL=... node scripts/backfill-geocode.mjs --applica # scrive
//
// DRY RUN DI DEFAULT: stampa cosa farebbe e non tocca niente. Per
// scrivere serve --applica esplicito.
//
// Nominatim chiede massimo UNA richiesta al secondo e uno User-Agent
// identificabile: la pausa fra le chiamate non e' prudenza, e' la loro
// policy d'uso. Con poche strutture il giro dura secondi.

import postgres from 'postgres';

const APPLICA = process.argv.includes('--applica');
const PAUSA_MS = 1100;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL mancante');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function geocode(query) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', query);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'it');
  const res = await fetch(u, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Premura/1.0 (backfill coordinate strutture)' },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [hit] = await res.json();
  if (!hit) return null;
  return { latitude: Number(hit.lat), longitude: Number(hit.lon), displayName: hit.display_name };
}

try {
  const rows = await sql`
    select id, name, city
    from properties
    where (latitude is null or longitude is null)
      and city is not null and btrim(city) <> ''
    order by created_at
  `;

  console.log(`${APPLICA ? 'APPLICA' : 'DRY RUN'} — ${rows.length} strutture senza coordinate\n`);

  let risolte = 0;
  let mancate = 0;

  for (const p of rows) {
    // Prima il nome con la citta' (piu' preciso), poi la sola citta'.
    let hit = null;
    try {
      hit = (await geocode(`${p.name}, ${p.city}`)) ?? (await geocode(p.city));
    } catch (err) {
      console.error(`  ✗ ${p.name} — errore: ${err.message}`);
      mancate += 1;
      await new Promise((r) => setTimeout(r, PAUSA_MS));
      continue;
    }

    if (!hit) {
      console.log(`  ✗ ${p.name} (${p.city}) — nessun risultato`);
      mancate += 1;
    } else {
      console.log(
        `  ✓ ${p.name} (${p.city}) → ${hit.latitude}, ${hit.longitude}  [${hit.displayName}]`,
      );
      if (APPLICA) {
        await sql`
          update properties
          set latitude = ${String(hit.latitude)},
              longitude = ${String(hit.longitude)},
              updated_at = now()
          where id = ${p.id}
        `;
      }
      risolte += 1;
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  console.log(`\nRisolte: ${risolte} · non risolte: ${mancate}`);
  if (!APPLICA && risolte > 0) {
    console.log('Niente e’ stato scritto. Rilancia con --applica per salvare.');
  }
} finally {
  await sql.end();
}
