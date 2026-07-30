import { describe, expect, it } from 'vitest';
import { extractWahaMessageId } from '../src/whatsapp-waha';

// BUG 30/07: con engine WEBJS l'id del WAMessage e' un oggetto, non una
// stringa — e l'invio (gia' partito, HTTP 200) veniva marcato failed.

describe('extractWahaMessageId', () => {
  it('id stringa (engine NOWEB): passa invariato', () => {
    expect(extractWahaMessageId('3EB0ABC')).toBe('3EB0ABC');
  });

  it('id oggetto (engine WEBJS): usa _serialized', () => {
    expect(
      extractWahaMessageId({
        fromMe: true,
        remote: '4748356805@c.us',
        id: '3EB0ABC',
        _serialized: 'true_4748356805@c.us_3EB0ABC',
      } as never),
    ).toBe('true_4748356805@c.us_3EB0ABC');
  });

  it('oggetto senza _serialized: ripiega su id interno', () => {
    expect(extractWahaMessageId({ id: '3EB0ABC' } as never)).toBe('3EB0ABC');
  });
});
