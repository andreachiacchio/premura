// Diagnostica feed iCal + poll on-demand, eseguita SUL WORKER Fly.
//
// Perche' qui e non dalla sessione: ical.booking.com e' bloccato sia
// dalla rete di Andrea sia dal proxy dell'agente (403 alla CONNECT).
// Il worker Fly e' l'unico posto da cui il feed e' raggiungibile — ed
// e' anche l'ambiente che fa i poll veri, quindi quello che conta.
//
// SOLA LETTURA sul feed + poll reale sulle property indicate. Non
// crea property, non tocca righe di altri host. Nessun invio.
//
// Uso:
//   pnpm exec tsx src/scripts/ical-diag.ts <propertyId> [--poll]
// Senza --poll fa solo fetch e report (nessuna scrittura).

export {};

const [, , propertyIdArg, ...flags] = process.argv;
const doPoll = flags.includes('--poll');

if (!propertyIdArg) {
  console.error('[ical-diag] uso: tsx src/scripts/ical-diag.ts <propertyId> [--poll]');
  process.exit(1);
}

const { createServerClient, properties } = await import('@premura/db');
const { eq } = await import('drizzle-orm');
const nodeIcal = (await import('node-ical')).default;
const { mapIcalEventToBookingShell } = await import('../jobs/ical-event-mapper');
const { upsertBookingShell } = await import('../jobs/booking-upsert-repository');

const client = createServerClient();
const db = client.db;

const rows = await db
  .select({
    id: properties.id,
    name: properties.name,
    city: properties.city,
    icalSources: properties.icalSources,
  })
  .from(properties)
  .where(eq(properties.id, propertyIdArg))
  .limit(1);

const property = rows[0];
if (!property) {
  console.error(`[ical-diag] property ${propertyIdArg} non trovata`);
  process.exit(1);
}

console.log(`[ical-diag] property: ${property.name} (${property.city})`);
console.log(`[ical-diag] feed configurati: ${property.icalSources.length}`);

for (const src of property.icalSources) {
  console.log(`\n[ical-diag] ─── feed source=${src.source} ───`);
  // Host dell'URL senza il token: il token e' una credenziale.
  try {
    console.log(`[ical-diag] url host: ${new URL(src.url).host}`);
  } catch {
    console.log('[ical-diag] url non parsabile');
  }

  // 1. Fetch grezzo: status HTTP vero, non l'astrazione di node-ical.
  const startedAt = Date.now();
  let rawOk = false;
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'Premura/1.0 iCal diag' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    rawOk = res.ok;
    console.log(
      `[ical-diag] HTTP ${res.status} ${res.statusText} · ${body.length} byte · ${Date.now() - startedAt}ms`,
    );
    console.log(`[ical-diag] content-type: ${res.headers.get('content-type') ?? '(assente)'}`);
    const isCalendar = body.includes('BEGIN:VCALENDAR');
    const vevents = body.match(/BEGIN:VEVENT/g)?.length ?? 0;
    console.log(`[ical-diag] BEGIN:VCALENDAR presente: ${isCalendar} · VEVENT: ${vevents}`);
    if (!res.ok || !isCalendar) {
      console.log(`[ical-diag] corpo (primi 300 char): ${body.slice(0, 300)}`);
    }
  } catch (err) {
    console.log(
      `[ical-diag] FETCH FALLITO dopo ${Date.now() - startedAt}ms: ${err instanceof Error ? `${err.name} — ${err.message}` : String(err)}`,
    );
    continue;
  }
  if (!rawOk) continue;

  // 2. Parse con la stessa libreria del worker: se qui i numeri
  //    divergono dal conteggio grezzo, il problema e' il parsing.
  let components: unknown[] = [];
  try {
    const events = await nodeIcal.async.fromURL(src.url);
    components = Object.values(events);
    const vevents = components.filter(
      (c) => (c as { type?: string }).type === 'VEVENT',
    ) as Array<{ start?: Date; end?: Date; summary?: string; uid?: string }>;
    console.log(`[ical-diag] node-ical: ${components.length} componenti, ${vevents.length} VEVENT`);

    const sorted = [...vevents].sort(
      (a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0),
    );
    for (const ev of sorted.slice(0, 5)) {
      const iso = (d?: Date) => (d ? d.toISOString().slice(0, 10) : '?');
      console.log(
        `[ical-diag]   ${iso(ev.start)} -> ${iso(ev.end)} · summary="${ev.summary ?? ''}" · uid=${(ev.uid ?? '').slice(0, 24)}…`,
      );
    }
    if (sorted.length > 5) console.log(`[ical-diag]   … e altre ${sorted.length - 5}`);
  } catch (err) {
    console.log(
      `[ical-diag] PARSE FALLITO: ${err instanceof Error ? `${err.name} — ${err.message}` : String(err)}`,
    );
    continue;
  }

  if (!doPoll) {
    console.log('[ical-diag] (--poll non passato: nessuna scrittura)');
    continue;
  }
  if (src.source === 'channel_manager') {
    console.log('[ical-diag] channel_manager: il worker lo salta, salto anche qui');
    continue;
  }

  // 3. Poll reale: stessa catena del worker (mapper + upsert).
  let mapped = 0;
  let inserted = 0;
  let skipped = 0;
  let suppressed = 0;
  let errors = 0;
  for (const component of components) {
    if ((component as { type?: string }).type !== 'VEVENT') continue;
    const shell = mapIcalEventToBookingShell(
      component as Parameters<typeof mapIcalEventToBookingShell>[0],
      property.id,
      src.source,
    );
    if (!shell) continue;
    mapped += 1;
    try {
      const result = await upsertBookingShell(db, shell);
      if (result.inserted) inserted += 1;
      else if (result.skipped) skipped += 1;
      if (result.suppressedCoverage) suppressed += 1;
    } catch (err) {
      errors += 1;
      console.log(
        `[ical-diag] upsert errore su ${shell.platformBookingRef.slice(0, 24)}…: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log(
    `[ical-diag] POLL: mappati=${mapped} inseriti=${inserted} gia_presenti=${skipped} soppressi=${suppressed} errori=${errors}`,
  );
}

const { sql } = await import('drizzle-orm');
const [{ count } = { count: 0 }] = await db.execute<{ count: number }>(
  sql`SELECT count(*)::int AS count FROM bookings WHERE property_id = ${property.id}`,
);
console.log(`\n[ical-diag] bookings totali sulla property adesso: ${count}`);

await client.close();
process.exit(0);
