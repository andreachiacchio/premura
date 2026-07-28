/**
 * Seed del catalogo servizi — Villa Cristina (Praiano).
 *
 * Questo file NON è il listino: è il popolamento iniziale della tabella
 * `services`, che resta l'unica fonte di verità sui prezzi (decisione ⑥).
 * Dopo il primo seed, i prezzi si modificano dal pannello admin o via
 * SQL, non riscrivendo questo file — così a ogni cambio di stagione non
 * serve un deploy.
 *
 * Doppio prezzo (decisione ②):
 *   supplierCostEur = quanto riconosciamo al fornitore
 *   salePriceEur    = quanto paga l'ospite
 *   margine         = differenza, calcolata a valle. MAI esposta all'ospite.
 *
 * Uso:
 *   pnpm tsx packages/db/src/seed-services.ts --property <uuid>
 *   pnpm tsx packages/db/src/seed-services.ts --property <uuid> --dry-run
 *
 * Idempotente: l'upsert avviene su (property_id, slug). Rilanciarlo
 * aggiorna i campi descrittivi ma NON sovrascrive i prezzi già presenti
 * a meno di passare --overwrite-prices: se l'host ha ritoccato un prezzo
 * dal pannello, un seed distratto non deve annullargli la modifica.
 */

import { sql } from 'drizzle-orm';
import { createServerClient } from './client';
import { services } from './schema/services';

// Listino iniziale. I costi fornitore dei boat tour sono il listino
// Ad Maiora Charter; i prezzi di vendita includono il margine host.
export const VILLA_CRISTINA_SERVICES = [
  {
    slug: 'boat-tour-full-day',
    category: 'boat_tour' as const,
    titleEn: 'Gozzo Boat Tour — Full Day',
    titleIt: 'Giro in gozzo — Giornata intera',
    descriptionEn:
      'Private tour on a traditional gozzo sorrentino with local skipper. Capri, Li Galli, hidden caves and swimming stops. All inclusive: drinks, snacks, towels, snorkelling gear, fuel and taxes.',
    descriptionIt:
      'Tour privato su gozzo sorrentino tradizionale con skipper locale. Capri, Li Galli, grotte nascoste e soste bagno. Tutto incluso: bevande, snack, teli, attrezzatura snorkeling, carburante e tasse.',
    supplierCostEur: '800.00',
    salePriceEur: '900.00',
    priceUnitEn: 'per boat',
    priceUnitIt: 'a barca',
    supplierName: 'Ad Maiora Charter',
    durationLabelEn: '7h · 9:30–16:30 or 10:00–17:00',
    durationLabelIt: '7h · 9:30–16:30 oppure 10:00–17:00',
    sortOrder: 10,
    isFeatured: true,
  },
  {
    slug: 'boat-tour-half-day',
    category: 'boat_tour' as const,
    titleEn: 'Gozzo Boat Tour — Half Day',
    titleIt: 'Giro in gozzo — Mezza giornata',
    descriptionEn:
      'Half day along the Amalfi Coast on a traditional gozzo with local skipper. Positano, Praiano and swimming stops in crystal-clear coves. All inclusive.',
    descriptionIt:
      'Mezza giornata lungo la Costiera su gozzo tradizionale con skipper locale. Positano, Praiano e soste bagno in cale cristalline. Tutto incluso.',
    supplierCostEur: '450.00',
    salePriceEur: '550.00',
    priceUnitEn: 'per boat',
    priceUnitIt: 'a barca',
    supplierName: 'Ad Maiora Charter',
    durationLabelEn: '4h · 9:30–13:30 or 14:00–18:00',
    durationLabelIt: '4h · 9:30–13:30 oppure 14:00–18:00',
    sortOrder: 20,
    isFeatured: false,
  },
  {
    slug: 'boat-tour-sunset',
    category: 'boat_tour' as const,
    titleEn: 'Gozzo Boat Tour — Sunset',
    titleIt: 'Giro in gozzo — Tramonto',
    descriptionEn:
      'Two hours on the water at golden hour, with the coast lighting up from the sea. All inclusive, perfect for couples.',
    descriptionIt:
      'Due ore in mare nell’ora d’oro, con la costa che si illumina vista dal mare. Tutto incluso, perfetto per coppie.',
    supplierCostEur: '250.00',
    salePriceEur: '350.00',
    priceUnitEn: 'per boat',
    priceUnitIt: 'a barca',
    supplierName: 'Ad Maiora Charter',
    durationLabelEn: '2h · 18:30–20:30',
    durationLabelIt: '2h · 18:30–20:30',
    sortOrder: 30,
    isFeatured: false,
  },
  {
    slug: 'private-transfer',
    category: 'transfer' as const,
    titleEn: 'Private Transfer',
    titleIt: 'Transfer privato',
    descriptionEn:
      'Door-to-door private transfer between Praiano and Naples airport, Naples train station or Sorrento. Six-seat vehicle, air conditioning, large boot. Fixed price per vehicle, not per person.',
    descriptionIt:
      'Transfer privato porta a porta tra Praiano e aeroporto di Napoli, stazione di Napoli o Sorrento. Veicolo 6 posti, aria condizionata, bagagliaio ampio. Prezzo fisso a veicolo, non a persona.',
    // Rotte principali a 250 €, ma percorsi custom (Roma, Salerno,
    // Pompei…) si quotano caso per caso: il catalogo mostra "su
    // richiesta" e la trattativa passa da WhatsApp.
    priceOnRequest: true,
    priceUnitEn: 'per vehicle',
    priceUnitIt: 'a veicolo',
    durationLabelEn: 'Naples airport ≈ 90 min',
    durationLabelIt: 'Aeroporto di Napoli ≈ 90 min',
    sortOrder: 40,
    isFeatured: false,
  },
  {
    slug: 'private-chef',
    category: 'chef' as const,
    titleEn: 'Private Chef Dinner',
    titleIt: 'Chef privato in villa',
    descriptionEn:
      'A chef cooks for you on the panoramic terrace: four-course menu with selected Campanian wines. Minimum two people, 48h notice.',
    descriptionIt:
      'Uno chef cucina per voi sulla terrazza panoramica: menù di quattro portate con vini campani selezionati. Minimo due persone, preavviso 48h.',
    priceOnRequest: true,
    priceUnitEn: 'per person',
    priceUnitIt: 'a persona',
    durationLabelEn: 'Evening · 48h notice',
    durationLabelIt: 'Sera · preavviso 48h',
    sortOrder: 50,
    isFeatured: false,
  },
  {
    slug: 'extra-cleaning',
    category: 'cleaning' as const,
    titleEn: 'Extra Cleaning & Fresh Linen',
    titleIt: 'Pulizia extra e cambio biancheria',
    descriptionEn:
      'A full extra clean of the villa during your stay, on request. Includes a complete change of bed linen and towels for all guests.',
    descriptionIt:
      'Pulizia completa extra della villa durante il soggiorno, su richiesta. Include il cambio completo di biancheria da letto e asciugamani per tutti gli ospiti.',
    salePriceEur: '200.00',
    priceUnitEn: 'per cleaning',
    priceUnitIt: 'a intervento',
    sortOrder: 60,
    isFeatured: false,
  },
] satisfies Array<Omit<typeof services.$inferInsert, 'propertyId'>>;

async function main() {
  const args = process.argv.slice(2);
  const propertyId = args[args.indexOf('--property') + 1];
  const dryRun = args.includes('--dry-run');
  const overwritePrices = args.includes('--overwrite-prices');

  if (!args.includes('--property') || !propertyId) {
    console.error('[seed-services] ERRORE: --property <uuid> è obbligatorio.');
    process.exit(1);
  }

  console.log(
    `[seed-services] property=${propertyId} servizi=${VILLA_CRISTINA_SERVICES.length}` +
      `${dryRun ? ' (DRY RUN)' : ''}${overwritePrices ? ' (sovrascrive i prezzi)' : ''}`,
  );

  // In dry-run non apriamo nemmeno la connessione: il file deve poter
  // girare per un controllo del listino senza un DB raggiungibile.
  const client = dryRun ? null : createServerClient();

  for (const svc of VILLA_CRISTINA_SERVICES) {
    const margin =
      svc.supplierCostEur && svc.salePriceEur
        ? (Number(svc.salePriceEur) - Number(svc.supplierCostEur)).toFixed(2)
        : null;

    console.log(
      `  - ${svc.slug.padEnd(22)} ${svc.priceOnRequest ? 'su richiesta' : `€${svc.salePriceEur}`}` +
        `${margin ? ` (costo €${svc.supplierCostEur}, margine €${margin})` : ''}`,
    );

    if (!client) continue;

    // Upsert su (property_id, slug): il seed è rieseguibile.
    await client.db
      .insert(services)
      .values({ ...svc, propertyId })
      .onConflictDoUpdate({
        target: [services.propertyId, services.slug],
        set: {
          titleEn: svc.titleEn,
          titleIt: svc.titleIt ?? null,
          descriptionEn: svc.descriptionEn ?? null,
          descriptionIt: svc.descriptionIt ?? null,
          priceUnitEn: svc.priceUnitEn ?? null,
          priceUnitIt: svc.priceUnitIt ?? null,
          durationLabelEn: svc.durationLabelEn ?? null,
          durationLabelIt: svc.durationLabelIt ?? null,
          sortOrder: svc.sortOrder,
          isFeatured: svc.isFeatured ?? false,
          updatedAt: sql`now()`,
          // I prezzi si toccano solo su richiesta esplicita: l'host
          // potrebbe averli ritoccati dal pannello.
          ...(overwritePrices
            ? {
                supplierCostEur: svc.supplierCostEur ?? null,
                salePriceEur: svc.salePriceEur ?? null,
                priceOnRequest: svc.priceOnRequest ?? false,
              }
            : {}),
        },
      });
  }

  await client?.close();
  console.log(`[seed-services] ${dryRun ? 'simulazione completata' : 'seed completato'}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-services] errore:', err);
  process.exit(1);
});
