// Seed database — popolamento iniziale dev con i dati reali di Andrea.
//
// Strategia idempotenza: SCOPED DELETE + INSERT, tutto in una transazione.
//
// Perché scoped (vs reset globale su tutte le tabelle):
//   - Sicuro anche se un giorno avremo più host di test in dev
//   - Non tocca tabelle/righe di altri host
//   - Chiave di deduplica stabile: hosts.email (già UNIQUE a DB)
//
// Perché non UPSERT:
//   - UPSERT non gestisce "rimozioni": se domani togliamo un partner
//     dal seed, con upsert resterebbe nel DB. Con DELETE+INSERT ogni
//     run ricostruisce lo stato dichiarato nel file.
//   - I seed sono idempotenti per costruzione, non per merge semantica.
//
// Ordine FK gestito dal cascade dello schema:
//   hosts cascade → properties, cleaners, autopilot_rules,
//                    host_voice_profiles, pending_drafts, agent_actions
//   properties cascade → bookings, property_knowledge_base
//   bookings cascade → guest_profiles, guest_quizzes, kits,
//                       conversations, messages, reviews
//
// Eccezione: local_partners.host_id ha ON DELETE SET NULL (perché un
// partner può sopravvivere alla cancellazione dell'host che l'ha
// introdotto, diventando city-scoped condiviso). Quindi lo cancelliamo
// a mano PRIMA di cancellare l'host, altrimenti resterebbe con
// host_id=null dopo ogni run.

import { config as loadEnv } from 'dotenv';

// Import hoisted above tutti — ma loadEnv() deve girare prima che
// createServerClient() venga chiamata (non prima dell'eval del modulo
// client, che non tocca process.env fino alla chiamata).
import { eq } from 'drizzle-orm';

import { createServerClient } from './client';
import { cleaners, hosts, localPartners, properties } from './schema';
import type { IcalSource } from './schema/properties';

loadEnv({ path: '.env.local' });

// ─────────────────────────────────────────────────────────────
// Costanti seed — dati reali Andrea + 3 strutture
// ─────────────────────────────────────────────────────────────

const ANDREA_EMAIL = 'andreachiacchio1992@gmail.com';
// Placeholder phone: aggiornare in env o direttamente dopo primo signup reale.
const PLACEHOLDER_PHONE = '+390000000000';

const PROPERTIES_DATA: Array<{
  name: string;
  addressLine: string;
  city: string;
  kitBudgetEur: string;
  icalSources: IcalSource[];
}> = [
  {
    name: 'La Goccia',
    addressLine: 'Napoli Centro Storico (tag jacuzzi-centro-storico)',
    city: 'Napoli',
    kitBudgetEur: '12.00',
    icalSources: [
      { source: 'booking', url: 'https://ical.placeholder/booking/la-goccia' },
      { source: 'airbnb', url: 'https://ical.placeholder/airbnb/la-goccia' },
    ],
  },
  {
    name: 'La Napoli Sotterranea',
    addressLine: 'Napoli Centro Storico',
    city: 'Napoli',
    kitBudgetEur: '12.00',
    icalSources: [
      {
        source: 'channel_manager',
        url: 'https://ical.placeholder/smoobu/napoli-sotterranea',
        channelManagerName: 'smoobu',
      },
    ],
  },
  {
    name: 'Villa Cristina',
    addressLine: 'Praiano (SA), Costiera Amalfitana',
    city: 'Praiano',
    // Budget leggermente più alto: clientela costiera premium.
    kitBudgetEur: '15.00',
    icalSources: [
      { source: 'booking', url: 'https://ical.placeholder/booking/villa-cristina-praiano' },
      { source: 'airbnb', url: 'https://ical.placeholder/airbnb/villa-cristina-praiano' },
    ],
  },
];

// TODO Fase 2: partner Costiera Amalfitana (pasticcerie Amalfi/Positano,
// limoncello artigianale, panificio tipico). Villa Cristina è oggi
// scoperta a livello locale: il Kit Composer userà fallback Amazon.
const PARTNERS_DATA = [
  {
    name: 'Pasticceria Poppella',
    type: 'pastry' as const,
    city: 'Napoli',
    addressLine: 'Rione Sanità, Napoli',
    whatsappNumber: PLACEHOLDER_PHONE,
  },
  {
    name: 'Scaturchio',
    type: 'pastry' as const,
    city: 'Napoli',
    addressLine: 'Spaccanapoli, Napoli',
    whatsappNumber: PLACEHOLDER_PHONE,
  },
  {
    name: 'Enoteca Partenopea',
    type: 'wine' as const,
    city: 'Napoli',
    addressLine: 'Vomero, Napoli',
    whatsappNumber: PLACEHOLDER_PHONE,
  },
];

// Narrowing helper: Drizzle `.returning()` tipizza come array potenzialmente
// vuoto, ma dopo un INSERT singolo sappiamo che c'è una riga. Se il DB
// restituisce vuoto è un bug del driver, non uno stato gestito dall'app.
function requireOne<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`[seed] insert ${label} non ha ritornato righe`);
  return row;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function seed() {
  const client = createServerClient();
  const { db } = client;

  console.log(`[seed] Target host email: ${ANDREA_EMAIL}`);

  await db.transaction(async (tx) => {
    // STEP 1 — Cleanup scoped
    const [existing] = await tx
      .select({ id: hosts.id })
      .from(hosts)
      .where(eq(hosts.email, ANDREA_EMAIL));

    if (existing) {
      console.log(`[seed] Host esistente ${existing.id} — reset scoped in corso…`);
      // local_partners ha ON DELETE SET NULL: cancelliamo a mano.
      await tx.delete(localPartners).where(eq(localPartners.hostId, existing.id));
      // hosts: cascade gestisce properties, cleaners e tutto il sotto-albero.
      await tx.delete(hosts).where(eq(hosts.id, existing.id));
      console.log('[seed] Reset completato.');
    } else {
      console.log('[seed] Nessun host esistente, procedo con insert pulito.');
    }

    // STEP 2 — Host Andrea
    const andrea = requireOne(
      await tx
        .insert(hosts)
        .values({
          email: ANDREA_EMAIL,
          fullName: 'Andrea Chiacchio',
          phone: PLACEHOLDER_PHONE, // TODO aggiornare con numero reale
          locale: 'it-IT',
          timezone: 'Europe/Rome',
          onboardingCompleted: false,
        })
        .returning({ id: hosts.id }),
      'host Andrea',
    );
    console.log(`[seed] Host creato: Andrea Chiacchio (${andrea.id})`);

    // STEP 3 — Cleaner Karen (condivisa su tutte le 3 properties)
    const karen = requireOne(
      await tx
        .insert(cleaners)
        .values({
          hostId: andrea.id,
          fullName: 'Karen',
          whatsappNumber: '+393331234567', // placeholder
          deliveryAddress: 'Indirizzo casa cleaner, Napoli', // TODO indirizzo vero
          // perKitFeeEur lasciato al default schema ('2.00')
          isActive: true,
        })
        .returning({ id: cleaners.id }),
      'cleaner Karen',
    );
    console.log(`[seed] Cleaner creata: Karen (${karen.id})`);

    // STEP 4 — Properties × 3
    for (const p of PROPERTIES_DATA) {
      const created = requireOne(
        await tx
          .insert(properties)
          .values({
            hostId: andrea.id,
            cleanerId: karen.id,
            name: p.name,
            addressLine: p.addressLine,
            city: p.city,
            kitBudgetEur: p.kitBudgetEur,
            icalSources: p.icalSources,
          })
          .returning({ id: properties.id, name: properties.name }),
        `property ${p.name}`,
      );
      console.log(`[seed] Property creata: ${created.name} (${created.id})`);
    }

    // STEP 5 — Local partners × 3 (tutti Napoli, host_id = Andrea)
    for (const partner of PARTNERS_DATA) {
      const created = requireOne(
        await tx
          .insert(localPartners)
          .values({
            hostId: andrea.id,
            name: partner.name,
            type: partner.type,
            city: partner.city,
            addressLine: partner.addressLine,
            whatsappNumber: partner.whatsappNumber,
          })
          .returning({ id: localPartners.id, name: localPartners.name }),
        `partner ${partner.name}`,
      );
      console.log(`[seed] Partner creato: ${created.name} (${created.id})`);
    }
  });

  console.log('');
  console.log('[seed] === Riepilogo ===');
  console.log('  1 host     → Andrea Chiacchio');
  console.log('  1 cleaner  → Karen (condivisa su tutte le properties)');
  console.log('  3 properties → La Goccia, La Napoli Sotterranea, Villa Cristina');
  console.log('  3 partners → Pasticceria Poppella, Scaturchio, Enoteca Partenopea');
  console.log('[seed] Done.');

  await client.close();
}

seed().catch((err) => {
  console.error('[seed] Errore:', err);
  process.exit(1);
});
