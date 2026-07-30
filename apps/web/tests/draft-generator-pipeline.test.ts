import { type Database, conversations, hosts, providers } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import { triggerDraftGeneration } from '../lib/draft-generator-pipeline';

// Test pipeline draft generator (slice 11) end-to-end con Drizzle
// mock + generator mock. Niente Anthropic.

const baseDraft = {
  draft_body: 'Ciao Mario, le chiavi sono nel keybox sopra al campanello, codice 1234.',
  confidence: 0.9,
  reasoning: 'Domanda diretta su keybox, info presente nella property knowledge.',
  classification: 'info_request' as const,
  suggested_action: 'auto_send' as const,
};

function makeMockDb(opts: {
  existingDraft?: { id: string } | null;
  recentOutbound?: { id: string } | null;
  bookingRow?: {
    bookingId: string;
    propertyId: string;
    propertyName: string;
    hostId: string;
    guestFirstName: string | null;
    guestFullName: string;
    guestLanguage?: string | null;
  } | null;
  messages?: Array<{ direction: string; fromEntity: string; body: string; sentAt: Date | null }>;
  voiceProfile?: {
    voiceConfidence?: number;
    formalityScore?: string | null;
    avgSentenceLength?: string | null;
    emojiUsageRate?: string | null;
    commonPhrases?: Array<{ phrase: string; count: number }>;
    greetingPatterns?: string[];
    closingPatterns?: string[];
  } | null;
  propertyKnowledge?: Record<string, unknown> | null;
  guestInsights?: { messageInsights?: Record<string, unknown> } | null;
  // FASE 3: numeri dei fornitori 'internal' dell'host (guardia bozze).
  providerPhones?: string[];
  // FASE 3: conversations.ai_disclosure_sent_at del thread (null = mai).
  disclosureSentAt?: Date | null;
  hostDisclosureCustom?: { it?: string; en?: string } | null;
}) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  let limitCount = 0;
  let orderByLimitCount = 0;

  const mock = {
    select: () => ({
      // Le tre query Fase 3 (fornitori, conversation, host) sono
      // instradate per IDENTITA' di tabella; tutto il resto resta sul
      // contatore posizionale originale, cosi' i test esistenti non
      // cambiano sequenza.
      from: (table: unknown) => {
        if (table === providers) {
          return {
            where: () => Promise.resolve((opts.providerPhones ?? []).map((phone) => ({ phone }))),
          };
        }
        if (table === conversations) {
          return {
            where: () => ({
              limit: () => Promise.resolve([{ at: opts.disclosureSentAt ?? null }]),
            }),
          };
        }
        if (table === hosts) {
          return {
            where: () => ({
              limit: () => Promise.resolve([{ custom: opts.hostDisclosureCustom ?? null }]),
            }),
          };
        }
        return {
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve(opts.messages ?? []),
              }),
            }),
          }),
          where: () => ({
            limit: () => Promise.resolve(opts.bookingRow ? [opts.bookingRow] : []),
          }),
        }),
        where: () => ({
          limit: () => {
            limitCount++;
            // 1: pending_drafts existing for messageId
            if (limitCount === 1) {
              return Promise.resolve(opts.existingDraft ? [opts.existingDraft] : []);
            }
            // 2: recent outbound dedup
            if (limitCount === 2) {
              return Promise.resolve(opts.recentOutbound ? [opts.recentOutbound] : []);
            }
            // 3: voice profile
            if (limitCount === 3) {
              return Promise.resolve(
                opts.voiceProfile
                  ? [
                      {
                        id: 'vp-1',
                        hostId: 'host-1',
                        ...opts.voiceProfile,
                        commonPhrases: opts.voiceProfile.commonPhrases ?? [],
                        greetingPatterns: opts.voiceProfile.greetingPatterns ?? [],
                        closingPatterns: opts.voiceProfile.closingPatterns ?? [],
                        languageDistribution: {},
                        messagesAnalyzed: 50,
                        voiceConfidence: String(opts.voiceProfile.voiceConfidence ?? 0.5),
                        processedMessageIds: [],
                      },
                    ]
                  : [],
              );
            }
            // 4: property knowledge
            if (limitCount === 4) {
              return Promise.resolve(opts.propertyKnowledge ? [opts.propertyKnowledge] : []);
            }
            // 5: guest insights
            if (limitCount === 5) {
              return Promise.resolve(opts.guestInsights ? [opts.guestInsights] : []);
            }
            return Promise.resolve([]);
          },
          orderBy: () => ({
            limit: () => {
              orderByLimitCount++;
              return Promise.resolve(opts.messages ?? []);
            },
          }),
        }),
        };
      },
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        const isAgent = 'agent' in vals && 'actionType' in vals;
        const isDraft = 'kind' in vals && vals.kind === 'reply_draft';
        const table = isAgent ? 'agent_actions' : isDraft ? 'pending_drafts' : 'unknown';
        inserts.push({ table, values: vals });
        return {
          returning: () =>
            Promise.resolve([
              { id: `${table === 'agent_actions' ? 'aa' : 'pd'}-${inserts.length}` },
            ]),
        };
      },
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  };

  return { db: mock as unknown as Database, inserts };
}

const fakeGenerator = vi.fn().mockResolvedValue(baseDraft);

describe('triggerDraftGeneration - skip cases', () => {
  it('body troppo corto -> skipped_short_body', async () => {
    fakeGenerator.mockClear();
    const { db } = makeMockDb({});
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'ciao',
      hostId: 'host-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('skipped_short_body');
    expect(fakeGenerator).not.toHaveBeenCalled();
  });

  it('body placeholder -> skipped_placeholder', async () => {
    fakeGenerator.mockClear();
    const { db } = makeMockDb({});
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: '[Booking message — apri Extranet]',
      hostId: 'host-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('skipped_placeholder');
    expect(fakeGenerator).not.toHaveBeenCalled();
  });

  it('draft gia esistente per questo messageId -> skipped_existing_draft', async () => {
    fakeGenerator.mockClear();
    const { db } = makeMockDb({
      existingDraft: { id: 'pd-existing' },
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('skipped_existing_draft');
    expect(r.draftId).toBe('pd-existing');
    expect(fakeGenerator).not.toHaveBeenCalled();
  });

  it('outbound recente (30 min) -> skipped_recent_outbound', async () => {
    fakeGenerator.mockClear();
    const { db } = makeMockDb({
      existingDraft: null,
      recentOutbound: { id: 'm-outbound-recent' },
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('skipped_recent_outbound');
    expect(fakeGenerator).not.toHaveBeenCalled();
  });

  it('booking senza property -> skipped_no_property', async () => {
    fakeGenerator.mockClear();
    const { db } = makeMockDb({
      existingDraft: null,
      recentOutbound: null,
      bookingRow: null,
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('skipped_no_property');
  });
});

describe('triggerDraftGeneration - happy path', () => {
  it('contesto completo -> generated + draft inserito + routing notify_host (default WA off)', async () => {
    fakeGenerator.mockClear();
    const { db, inserts } = makeMockDb({
      existingDraft: null,
      recentOutbound: null,
      bookingRow: {
        bookingId: 'b1',
        propertyId: 'p1',
        propertyName: 'La Goccia',
        hostId: 'host-1',
        guestFirstName: 'Mario',
        guestFullName: 'Mario Rossi',
      },
      messages: [
        {
          direction: 'inbound',
          fromEntity: 'guest',
          body: 'A che ora il check-in?',
          sentAt: new Date(),
        },
      ],
      voiceProfile: {
        voiceConfidence: 0.7,
        formalityScore: '3.5',
        avgSentenceLength: '12',
        emojiUsageRate: '0.3',
      },
      propertyKnowledge: {
        propertyId: 'p1',
        keybox: { code: '1234' },
        wifi: null,
        parking: null,
        houseRules: null,
        emergencyContacts: [],
        nearbyEssentials: [],
        additionalInfo: null,
        updatedAt: new Date(),
      },
    });

    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('generated');
    expect(r.draftId).toBeDefined();
    expect(r.routing).toBe('notify_host'); // WA non live default
    expect(r.confidence).toBe(0.9);
    expect(fakeGenerator).toHaveBeenCalledOnce();

    // Insert pending_draft con metadata corretti.
    const draftInsert = inserts.find((i) => i.table === 'pending_drafts');
    expect(draftInsert).toBeDefined();
    if (!draftInsert) throw new Error('expected draft insert');
    const vals = draftInsert.values;
    expect(vals.kind).toBe('reply_draft');
    expect(vals.replyToMessageId).toBe('m1');
    expect(vals.draftResponse).toBe(baseDraft.draft_body);
    expect(vals.reasoning).toBe(baseDraft.reasoning);
    const meta = vals.metadata as Record<string, unknown>;
    expect(meta.confidence).toBe(0.9);
    expect(meta.classification).toBe('info_request');
    expect(meta.routing).toBe('notify_host');
  });

  it('WA live + confidence alta + info_request -> routing auto_send', async () => {
    fakeGenerator.mockClear();
    const { db } = makeMockDb({
      existingDraft: null,
      recentOutbound: null,
      bookingRow: {
        bookingId: 'b1',
        propertyId: 'p1',
        propertyName: 'La Goccia',
        hostId: 'host-1',
        guestFirstName: 'Mario',
        guestFullName: 'Mario Rossi',
      },
      messages: [{ direction: 'inbound', fromEntity: 'guest', body: 'wifi?', sentAt: new Date() }],
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'Qual è la password del wifi?',
      hostId: 'host-1',
      generator: fakeGenerator,
      waChannelLive: true,
    });
    expect(r.routing).toBe('auto_send');
  });
});

describe('triggerDraftGeneration - generator error', () => {
  it('generator throws -> generator_error', async () => {
    const failingGenerator = vi.fn().mockRejectedValue(new Error('Anthropic timeout'));
    const { db } = makeMockDb({
      existingDraft: null,
      recentOutbound: null,
      bookingRow: {
        bookingId: 'b1',
        propertyId: 'p1',
        propertyName: 'La Goccia',
        hostId: 'host-1',
        guestFirstName: null,
        guestFullName: 'Mario Rossi',
      },
      messages: [{ direction: 'inbound', fromEntity: 'guest', body: 'q?', sentAt: new Date() }],
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
      generator: failingGenerator,
    });
    expect(r.status).toBe('generator_error');
    expect(r.reason).toBe('Anthropic timeout');
  });
});

// FASE 3 (30/07): le due guardie sulla bozza. Anche una bozza che
// l'host approverebbe con un tocco deve rispettare le stesse regole
// degli invii automatici: mai contatti di fornitori interni, disclosure
// AI in testa alla prima risposta della conversazione.
describe('triggerDraftGeneration - guardie Fase 3', () => {
  const bookingRow = {
    bookingId: 'b1',
    propertyId: 'p1',
    propertyName: 'La Goccia',
    hostId: 'host-1',
    guestFirstName: 'Mario',
    guestFullName: 'Mario Rossi',
    guestLanguage: 'it',
  };
  const inboundContext = [
    { direction: 'inbound', fromEntity: 'guest', body: 'Serve un transfer', sentAt: new Date() },
  ];

  it('bozza col numero di un fornitore interno -> provider_contact_leak, nessun draft inserito', async () => {
    const leakyGenerator = vi.fn().mockResolvedValue({
      ...baseDraft,
      draft_body: 'Per il transfer chiama Antonio al +39 350 032 8207.',
    });
    const { db, inserts } = makeMockDb({
      existingDraft: null,
      recentOutbound: null,
      bookingRow,
      messages: inboundContext,
      providerPhones: ['+393500328207'],
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'Ci serve un transfer dall aeroporto',
      hostId: 'host-1',
      conversationId: 'conv-1',
      generator: leakyGenerator,
    });
    expect(r.status).toBe('provider_contact_leak');
    // La generazione resta loggata (observabilita'), la bozza NO.
    expect(inserts.find((i) => i.table === 'agent_actions')).toBeDefined();
    expect(inserts.find((i) => i.table === 'pending_drafts')).toBeUndefined();
  });

  it('prima bozza della conversazione -> disclosure AI (lingua del booking) in testa', async () => {
    fakeGenerator.mockClear();
    const { db, inserts } = makeMockDb({
      existingDraft: null,
      recentOutbound: null,
      bookingRow,
      messages: inboundContext,
      disclosureSentAt: null,
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
      conversationId: 'conv-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('generated');
    const draftInsert = inserts.find((i) => i.table === 'pending_drafts');
    if (!draftInsert) throw new Error('expected draft insert');
    expect(draftInsert.values.draftResponse).toBe(
      `Ciao! Ti risponde l’assistente automatico di La Goccia.\n\n${baseDraft.draft_body}`,
    );
  });

  it('disclosure gia inviata nella conversazione -> testo proposto senza premessa', async () => {
    fakeGenerator.mockClear();
    const { db, inserts } = makeMockDb({
      existingDraft: null,
      recentOutbound: null,
      bookingRow,
      messages: inboundContext,
      disclosureSentAt: new Date('2026-07-29T10:00:00Z'),
    });
    const r = await triggerDraftGeneration(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
      conversationId: 'conv-1',
      generator: fakeGenerator,
    });
    expect(r.status).toBe('generated');
    const draftInsert = inserts.find((i) => i.table === 'pending_drafts');
    if (!draftInsert) throw new Error('expected draft insert');
    expect(draftInsert.values.draftResponse).toBe(baseDraft.draft_body);
  });
});
