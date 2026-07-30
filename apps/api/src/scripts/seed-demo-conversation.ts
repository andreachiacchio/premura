import { config as loadEnv } from 'dotenv';

// FASE 5 weekend (30/07) — seed demo REVERSIBILE per la sezione
// Conversazioni: una conversazione con 2 inbound finti e UNA bozza
// generata DAVVERO dalla pipeline (chiamata Claude reale, con log di
// modello/token/costo in agent_actions).
//
// Regole:
//  - nessun ospite reale, nessun numero reale: il "guest" e'
//    'Ospite Demo' col numero impossibile +390000000001
//  - nessun invio: la bozza nasce e RESTA pending (kill switch a parte,
//    non esiste un ramo che la invii senza approvazione)
//  - tutto marcato data_source='demo' e platform_booking_ref
//    'demo-conversation-1': si rimuove con UNA delete (le FK cascade
//    portano via conversazione, messaggi, bozza e log):
//
//      DELETE FROM bookings WHERE data_source = 'demo';
//
//  - idempotente: rilanciato, non duplica nulla.
//
// Uso (dalla macchina worker su Fly, dove vivono DATABASE_URL e
// ANTHROPIC_API_KEY):
//
//   fly ssh console --app premura-api-staging --process-group worker \
//     -C "pnpm exec tsx src/scripts/seed-demo-conversation.ts"

loadEnv({ path: '.env.local' });

const DEMO_REF = 'demo-conversation-1';
const DEMO_PHONE = '+390000000001';
const DEMO_THREAD = '390000000001';

const { createServerClient, bookings, conversations, hosts, messages, pendingDrafts, properties, agentActions } =
  await import('@premura/db');
const { and, asc, desc, eq } = await import('drizzle-orm');
const { triggerDraftGeneration } = await import('@premura/agents');

const client = createServerClient();
const db = client.db;

try {
  // Struttura di riferimento: la prima del primo host (pilot = un solo
  // host). La demo mostra nome e colore della struttura reale, ma il
  // booking e' inequivocabilmente finto.
  const [property] = await db
    .select({ id: properties.id, hostId: properties.hostId, name: properties.name })
    .from(properties)
    .innerJoin(hosts, eq(hosts.id, properties.hostId))
    .orderBy(asc(properties.createdAt))
    .limit(1);
  if (!property) {
    console.error('[demo-seed] nessuna property nel database: niente da fare');
    process.exit(1);
  }

  // 1. Booking demo (idempotente su platform_booking_ref).
  const [existingBooking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.platformBookingRef, DEMO_REF), eq(bookings.dataSource, 'demo')))
    .limit(1);

  let bookingId: string;
  if (existingBooking) {
    bookingId = existingBooking.id;
    console.log(`[demo-seed] booking demo gia' presente: ${bookingId}`);
  } else {
    const now = new Date();
    const checkin = new Date(now);
    checkin.setDate(checkin.getDate() - 1);
    checkin.setHours(15, 0, 0, 0);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() + 1);
    checkout.setHours(10, 0, 0, 0);
    const [inserted] = await db
      .insert(bookings)
      .values({
        propertyId: property.id,
        platform: 'direct',
        platformBookingRef: DEMO_REF,
        guestFullName: 'Ospite Demo',
        guestFirstName: 'Demo',
        guestPhone: DEMO_PHONE,
        guestLanguage: 'it',
        numGuests: 2,
        numAdults: 2,
        checkinAt: checkin,
        checkoutAt: checkout,
        nights: 2,
        status: 'confirmed',
        dataSource: 'demo',
        // premura_active_at resta NULL: nessun cron outbound deve mai
        // considerare questo booking.
      })
      .returning({ id: bookings.id });
    if (!inserted) throw new Error('insert booking demo fallito');
    bookingId = inserted.id;
    console.log(`[demo-seed] booking demo creato: ${bookingId} (${property.name})`);
  }

  // 2. Conversazione demo.
  const [existingConv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.bookingId, bookingId),
        eq(conversations.channel, 'whatsapp'),
        eq(conversations.externalThreadId, DEMO_THREAD),
      ),
    )
    .limit(1);

  let conversationId: string;
  if (existingConv) {
    conversationId = existingConv.id;
    console.log(`[demo-seed] conversazione gia' presente: ${conversationId}`);
  } else {
    const [insertedConv] = await db
      .insert(conversations)
      .values({
        bookingId,
        channel: 'whatsapp',
        externalThreadId: DEMO_THREAD,
        status: 'active',
        lastMessageAt: new Date(),
      })
      .returning({ id: conversations.id });
    if (!insertedConv) throw new Error('insert conversazione demo fallito');
    conversationId = insertedConv.id;
    console.log(`[demo-seed] conversazione creata: ${conversationId}`);
  }

  // 3. Due inbound finti (idempotenti su platform_message_id).
  const inbound = [
    {
      ref: 'demo-inbound-1',
      minutesAgo: 60,
      body: 'Buonasera! Domani arriviamo verso le 13, possiamo lasciare le valigie da qualche parte prima del check-in?',
    },
    {
      ref: 'demo-inbound-2',
      minutesAgo: 25,
      body: 'Ah, e ci consigliate un posto per cena stasera vicino alla casa? Niente di troppo turistico se possibile!',
    },
  ];

  let lastMessageId: string | null = null;
  let lastBody = '';
  for (const item of inbound) {
    const [existing] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.platformMessageId, item.ref))
      .limit(1);
    if (existing) {
      lastMessageId = existing.id;
      lastBody = item.body;
      console.log(`[demo-seed] inbound ${item.ref} gia' presente`);
      continue;
    }
    const sentAt = new Date(Date.now() - item.minutesAgo * 60_000);
    const [insertedMsg] = await db
      .insert(messages)
      .values({
        bookingId,
        conversationId,
        channel: 'whatsapp',
        direction: 'inbound',
        fromEntity: 'guest',
        toEntity: 'premura',
        body: item.body,
        status: 'received',
        platformMessageId: item.ref,
        recipientExternalId: DEMO_THREAD,
        sentAt,
        metadata: { demo: true },
      })
      .returning({ id: messages.id });
    if (!insertedMsg) throw new Error(`insert ${item.ref} fallito`);
    lastMessageId = insertedMsg.id;
    lastBody = item.body;
    console.log(`[demo-seed] inbound ${item.ref} creato: ${insertedMsg.id}`);
  }
  if (!lastMessageId) throw new Error('nessun messaggio inbound demo');

  // 4. Bozza generata DAVVERO (chiamata Claude reale via pipeline,
  //    stesse guardie di produzione). Idempotente: la pipeline stessa
  //    salta se esiste gia' una bozza per questo messaggio.
  console.log('[demo-seed] genero la bozza (chiamata Claude reale)...');
  const result = await triggerDraftGeneration(db, {
    messageId: lastMessageId,
    bookingId,
    body: lastBody,
    hostId: property.hostId,
    conversationId,
  });
  console.log(`[demo-seed] pipeline: ${JSON.stringify(result)}`);

  // Diagnosi (run 1 del 30/07: 'Anthropic API call failed' in 249ms,
  // causa non propagata dal wrapper nel risultato della pipeline). Se
  // la generazione fallisce, richiamiamo il generatore DIRETTAMENTE e
  // stampiamo la CAUSA della DraftGeneratorError: e' l'errore tipizzato
  // dell'SDK (401 chiave, 404 modello, errore di connessione...).
  if (result.status === 'generator_error') {
    const model = process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6';
    const keySet = Boolean(process.env.ANTHROPIC_API_KEY);
    console.log(`[demo-seed] diagnosi: model=${model} ANTHROPIC_API_KEY presente=${keySet}`);
    const { DraftGeneratorError, generateReplyDraft } = await import('@premura/agents');
    try {
      const draft = await generateReplyDraft({
        conversation: [
          {
            direction: 'inbound',
            fromEntity: 'guest',
            body: lastBody,
            sentAt: new Date(),
          },
        ],
        voiceProfile: null,
        guestInsights: null,
        propertyKnowledge: null,
        propertyName: property.name,
        guestFirstName: 'Demo',
      });
      console.log(
        `[demo-seed] chiamata diretta riuscita (confidence=${draft.confidence}): il problema sta nella pipeline, non nell'API`,
      );
    } catch (genErr) {
      const cause = genErr instanceof DraftGeneratorError ? genErr.cause : genErr;
      const status =
        typeof cause === 'object' && cause !== null && 'status' in cause
          ? (cause as { status: unknown }).status
          : null;
      const name = cause instanceof Error ? cause.name : typeof cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(
        `[demo-seed] causa vera del fallimento: status=${status} name=${name} msg=${message}`,
      );
    }
  }

  // 5. Numeri della chiamata per il report (modello/token/costo/latenza).
  const [action] = await db
    .select({
      model: agentActions.model,
      inputTokens: agentActions.inputTokens,
      outputTokens: agentActions.outputTokens,
      costUsd: agentActions.costUsd,
      latencyMs: agentActions.latencyMs,
    })
    .from(agentActions)
    .where(eq(agentActions.bookingId, bookingId))
    .orderBy(desc(agentActions.createdAt))
    .limit(1);
  if (action) {
    console.log(`[demo-seed] chiamata agente: ${JSON.stringify(action)}`);
  }

  if (result.status === 'generated' && result.draftId) {
    const [draft] = await db
      .select({ body: pendingDrafts.draftResponse })
      .from(pendingDrafts)
      .where(eq(pendingDrafts.id, result.draftId))
      .limit(1);
    console.log(`[demo-seed] bozza pending (MAI inviata):\n---\n${draft?.body ?? ''}\n---`);
  }

  console.log(
    "[demo-seed] fatto. Cleanup: DELETE FROM bookings WHERE data_source = 'demo';",
  );
  process.exit(0);
} catch (err) {
  console.error('[demo-seed] errore:', err);
  process.exit(1);
} finally {
  await client.close();
}
