import { type Database, bookings, conversationHandover, providers } from '@premura/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reserveAndSend } from '../src/outbound/reserve-and-send';

// IL test chiesto da Andrea (30/07): una risposta in uscita che contiene
// un numero di telefono presente in providers deve FALLIRE. La guardia
// sta in reserveAndSend — il choke point di OGNI invio — quindi copre
// benvenuti, bozze approvate e qualsiasi percorso futuro.

type Row = Record<string, unknown>;

// Finto Database: ogni select(...).from(tabella) risolve le righe
// preparate per quella tabella; insert/update accettano la catena
// drizzle e fingono successo. Basta per percorrere reserveAndSend.
function fakeDb(rowsByTable: Map<unknown, Row[]>): Database {
  function chain(rows: Row[]) {
    const c = {
      where: () => c,
      limit: () => c,
      innerJoin: () => c,
      orderBy: () => c,
      then: (onOk: (r: Row[]) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(onOk, onErr),
    };
    return c;
  }
  const insertChain = {
    values: () => insertChain,
    onConflictDoNothing: () => insertChain,
    returning: async () => [{ id: 'slot-1' }],
  };
  const updateChain = {
    set: () => updateChain,
    where: async () => [],
  };
  return {
    select: () => ({ from: (tbl: unknown) => chain(rowsByTable.get(tbl) ?? []) }),
    insert: () => insertChain,
    update: () => updateChain,
  } as unknown as Database;
}

const JULIAN_BOOKING: Row = {
  guestPhone: '+4748356805',
  premuraActiveAt: new Date('2026-07-29T14:00:00Z'),
  propertyId: 'prop-villa-cristina',
};

const ANTONIO: Row = { phone: '+393500328207' };

function db(providerRows: Row[]): Database {
  return fakeDb(
    new Map<unknown, Row[]>([
      [bookings, [JULIAN_BOOKING]],
      [providers, providerRows],
      [conversationHandover, []],
    ]),
  );
}

describe('reserveAndSend — guardia contatti fornitori', () => {
  // Stringa vuota, non delete: i parser la trattano come assente
  // (dry-run resta ON di default: nessuna chiamata di rete nei test).
  //
  // Il kill switch invece vuole 'off' ESPLICITO: dal 06/08 e' attivo a
  // meno che non lo si dichiari spento, quindi la stringa vuota lo
  // lascerebbe acceso e questi test verificherebbero il blocco
  // sbagliato — troverebbero il freno tirato invece della guardia
  // contatti. Qui serve il freno staccato per arrivare alla guardia.
  beforeEach(() => {
    process.env.WHATSAPP_KILL_SWITCH = 'off';
    process.env.WHATSAPP_DRY_RUN = '';
    process.env.WHATSAPP_TRANSPORT = '';
  });
  afterEach(() => {
    process.env.WHATSAPP_KILL_SWITCH = 'off';
    process.env.WHATSAPP_DRY_RUN = '';
    process.env.WHATSAPP_TRANSPORT = '';
  });

  it('risposta col numero del fornitore -> BLOCCATA, slot non bruciato', async () => {
    const result = await reserveAndSend(db([ANTONIO]), {
      bookingId: 'b-1',
      trigger: 'welcome',
      body: 'Sure! You can call our skipper directly at +39 350 032 8207 to arrange the tour.',
    });
    expect(result).toEqual({
      status: 'skipped',
      reason: 'provider_contact_leak',
      outboundSendId: null,
    });
  });

  it('anche in formato nazionale senza prefisso', async () => {
    const result = await reserveAndSend(db([ANTONIO]), {
      bookingId: 'b-1',
      trigger: 'welcome',
      body: 'il numero è 3500328207',
    });
    expect(result.status).toBe('skipped');
  });

  it('lo stesso messaggio SENZA il numero passa (dry-run)', async () => {
    const result = await reserveAndSend(db([ANTONIO]), {
      bookingId: 'b-1',
      trigger: 'welcome',
      body: 'Our skipper is available on Saturday — full day €900. How many people?',
    });
    expect(result.status).toBe('sent');
  });

  it('i contatti host-side (Paolo) NON sono bloccati: solo providers', async () => {
    const result = await reserveAndSend(db([ANTONIO]), {
      bookingId: 'b-1',
      trigger: 'welcome',
      body: 'Paolo will meet you at La Moressa restaurant in Praiano — +39 340 488 7726',
    });
    expect(result.status).toBe('sent');
  });
});
