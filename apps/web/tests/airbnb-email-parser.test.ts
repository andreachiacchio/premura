import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseAirbnbEmail, AirbnbParserError, _internals } from '../lib/airbnb-email-parser';

// Test del parser email Airbnb. Anthropic SDK è mockato: simuliamo
// messages.create() che ritorna un blocco tool_use con input controllato.
// Niente chiamate API reali in vitest; il test E2E con Claude lo fa
// Andrea manualmente collegando Gmail.

// ─────────────────────────────────────────────────────────────
// Helper: mock Anthropic client che ritorna content con tool_use block.
// ─────────────────────────────────────────────────────────────

function mockClient(opts: {
  toolUseInput?: unknown;
  toolName?: string;
  stopReason?: string;
  failWith?: Error;
  noToolUse?: boolean;
}): NonNullable<Parameters<typeof parseAirbnbEmail>[1]>['client'] {
  return {
    messages: {
      create: vi.fn(async () => {
        if (opts.failWith) throw opts.failWith;
        if (opts.noToolUse) {
          return {
            content: [{ type: 'text', text: 'something' }],
            stop_reason: opts.stopReason ?? 'end_turn',
          };
        }
        return {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_test',
              name: opts.toolName ?? 'extract_airbnb_email',
              input: opts.toolUseInput,
            },
          ],
          stop_reason: opts.stopReason ?? 'tool_use',
        };
      }),
    },
  } as unknown as NonNullable<Parameters<typeof parseAirbnbEmail>[1]>['client'];
}

// ─────────────────────────────────────────────────────────────
// Confirmation — Stephen Smith fixture
// ─────────────────────────────────────────────────────────────

describe('parseAirbnbEmail — confirmation', () => {
  it('estrae tutti i campi dalla fixture Stephen Smith', async () => {
    // Fixture gitignored (PII). Skip soft se assente.
    const fixturePath = join(
      __dirname,
      'fixtures',
      'airbnb-email-stephen-smith-private.json',
    );
    if (!existsSync(fixturePath)) {
      // eslint-disable-next-line no-console
      console.warn('[test] fixture privata mancante, skip');
      return;
    }
    const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      subject: string;
      date: string;
      htmlBody: string;
      textBody: string;
      expected: {
        guest_full_name: string;
        guest_first_name: string;
        guest_language: string;
        guest_message_original: string;
        check_in_date: string;
        check_out_date: string;
        nights: number;
        guest_count: number;
        host_payout_amount: number;
        host_payout_currency: string;
        booking_external_code: string;
        property_name_contains: string;
      };
    };

    const client = mockClient({
      toolUseInput: {
        email_type: 'confirmation',
        guest_full_name: raw.expected.guest_full_name,
        guest_first_name: raw.expected.guest_first_name,
        guest_country_code: 'GB',
        guest_language: raw.expected.guest_language,
        guest_count: raw.expected.guest_count,
        guest_message_original: raw.expected.guest_message_original,
        guest_message_lang: raw.expected.guest_language,
        host_payout_amount: raw.expected.host_payout_amount,
        host_payout_currency: raw.expected.host_payout_currency,
        check_in_date: raw.expected.check_in_date,
        check_out_date: raw.expected.check_out_date,
        nights: raw.expected.nights,
        booking_external_code: raw.expected.booking_external_code,
        property_name: '[Jacuzzi - Centro Storico] La goccia di S.Gennaro',
        airbnb_listing_url: null,
      },
    });

    const parsed = await parseAirbnbEmail(
      {
        subject: raw.subject,
        textBody: raw.textBody,
        htmlBody: raw.htmlBody,
        date: new Date(raw.date),
      },
      { client },
    );

    expect(parsed.email_type).toBe('confirmation');
    if (parsed.email_type !== 'confirmation') return;
    expect(parsed.guest_full_name).toBe('Stephen Smith');
    expect(parsed.guest_first_name).toBe('Stephen');
    expect(parsed.guest_language).toBe('en');
    expect(parsed.guest_message_original).toBe(raw.expected.guest_message_original);
    expect(parsed.check_in_date).toBe('2025-09-23');
    expect(parsed.check_out_date).toBe('2025-09-24');
    expect(parsed.nights).toBe(1);
    expect(parsed.guest_count).toBe(2);
    expect(parsed.host_payout_amount).toBe(110.62);
    expect(parsed.host_payout_currency).toBe('EUR');
    expect(parsed.booking_external_code).toBe('HM4XDFHECP');
    expect(parsed.property_name).toContain('La goccia di S.Gennaro');
  });

  it('passa system con cache_control + tool_choice forzato + modello sonnet 4.6', async () => {
    const client = mockClient({
      toolUseInput: {
        email_type: 'other',
        booking_external_code: null,
        property_name: null,
        airbnb_listing_url: null,
      },
    });

    await parseAirbnbEmail(
      { textBody: 'random', htmlBody: '', date: null, subject: 'Newsletter' },
      { client },
    );

    const createFn = (
      client as unknown as { messages: { create: ReturnType<typeof vi.fn> } }
    ).messages.create;
    expect(createFn).toHaveBeenCalledOnce();
    const firstCall = createFn.mock.calls[0];
    if (!firstCall) throw new Error('no calls');
    const args = firstCall[0];
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(Array.isArray(args.system)).toBe(true);
    expect(args.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(args.system[0].text).toBe(_internals.SYSTEM_PROMPT);
    expect(args.tool_choice).toEqual({ type: 'tool', name: _internals.TOOL_NAME });
    expect(Array.isArray(args.tools)).toBe(true);
    expect(args.tools[0].name).toBe(_internals.TOOL_NAME);
  });
});

// ─────────────────────────────────────────────────────────────
// Cancellation
// ─────────────────────────────────────────────────────────────

describe('parseAirbnbEmail — cancellation', () => {
  it('riconosce email cancellation con codice prenotazione', async () => {
    const client = mockClient({
      toolUseInput: {
        email_type: 'cancellation',
        guest_full_name: 'Maria Rossi',
        booking_external_code: 'HMABCD1234',
        property_name: 'La Goccia',
        airbnb_listing_url: null,
      },
    });
    const parsed = await parseAirbnbEmail(
      {
        textBody: 'Maria Rossi ha cancellato la prenotazione HMABCD1234',
        htmlBody: '',
        date: new Date('2025-10-01T09:00:00Z'),
        subject: 'Prenotazione cancellata',
      },
      { client },
    );
    expect(parsed.email_type).toBe('cancellation');
    if (parsed.email_type !== 'cancellation') return;
    expect(parsed.booking_external_code).toBe('HMABCD1234');
    expect(parsed.guest_full_name).toBe('Maria Rossi');
  });
});

// ─────────────────────────────────────────────────────────────
// Modification
// ─────────────────────────────────────────────────────────────

describe('parseAirbnbEmail — modification', () => {
  it('riconosce modifica date prenotazione', async () => {
    const client = mockClient({
      toolUseInput: {
        email_type: 'modification',
        guest_full_name: 'John Doe',
        guest_first_name: 'John',
        check_in_date: '2025-10-15',
        check_out_date: '2025-10-18',
        nights: 3,
        guest_count: 2,
        booking_external_code: 'HMNEWDATE0',
        property_name: 'La Goccia',
        airbnb_listing_url: null,
      },
    });
    const parsed = await parseAirbnbEmail(
      {
        textBody: 'Modifica date HMNEWDATE0',
        htmlBody: '',
        date: null,
        subject: 'Modifica prenotazione',
      },
      { client },
    );
    expect(parsed.email_type).toBe('modification');
    if (parsed.email_type !== 'modification') return;
    expect(parsed.check_in_date).toBe('2025-10-15');
    expect(parsed.nights).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// Pre-approval / other
// ─────────────────────────────────────────────────────────────

describe('parseAirbnbEmail — pre_approval / other', () => {
  it('classifica pre_approval (skip downstream)', async () => {
    const client = mockClient({
      toolUseInput: {
        email_type: 'pre_approval',
        booking_external_code: null,
        property_name: 'La Goccia',
        airbnb_listing_url: null,
      },
    });
    const parsed = await parseAirbnbEmail(
      { textBody: 'Pre-approvazione richiesta', htmlBody: '', date: null },
      { client },
    );
    expect(parsed.email_type).toBe('pre_approval');
  });

  it('classifica other per email non rilevanti (es. payout mensile)', async () => {
    const client = mockClient({
      toolUseInput: {
        email_type: 'other',
        booking_external_code: null,
        property_name: null,
        airbnb_listing_url: null,
      },
    });
    const parsed = await parseAirbnbEmail(
      {
        textBody: 'Il tuo guadagno di novembre è stato versato',
        htmlBody: '',
        date: null,
        subject: 'Hai ricevuto un nuovo pagamento',
      },
      { client },
    );
    expect(parsed.email_type).toBe('other');
  });
});

// ─────────────────────────────────────────────────────────────
// Errori
// ─────────────────────────────────────────────────────────────

describe('parseAirbnbEmail — errori', () => {
  it('AirbnbParserError se sia textBody che htmlBody sono vuoti', async () => {
    await expect(
      parseAirbnbEmail({ textBody: '', htmlBody: '', date: null }),
    ).rejects.toThrow(AirbnbParserError);
  });

  it('AirbnbParserError se Claude non chiama il tool (stop_reason end_turn)', async () => {
    const client = mockClient({ noToolUse: true, stopReason: 'end_turn' });
    await expect(
      parseAirbnbEmail({ textBody: 'foo', htmlBody: '', date: null }, { client }),
    ).rejects.toThrow(/non ha chiamato il tool/);
  });

  it('AirbnbParserError se output non valido contro Zod (campi mancanti su confirmation)', async () => {
    const client = mockClient({
      toolUseInput: {
        email_type: 'confirmation',
        guest_full_name: 'X',
        // mancano tutti gli altri required
      },
    });
    await expect(
      parseAirbnbEmail({ textBody: 'foo', htmlBody: '', date: null }, { client }),
    ).rejects.toThrow(/non valido contro lo schema Zod/);
  });
});
