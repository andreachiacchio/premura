import { describe, expect, it } from 'vitest';
import { MESSAGE_TOPICS, shouldSkipExtraction } from '../src/dna-extractor';

describe('shouldSkipExtraction', () => {
  it('body vuoto -> true', () => {
    expect(shouldSkipExtraction('')).toBe(true);
  });

  it('body 9 char -> true', () => {
    expect(shouldSkipExtraction('123456789')).toBe(true);
  });

  it('body 10 char -> false', () => {
    expect(shouldSkipExtraction('1234567890')).toBe(false);
  });

  it('body placeholder con [...] -> true', () => {
    expect(shouldSkipExtraction('[Booking message ricevuto da X — apri Extranet]')).toBe(true);
  });

  it('body con whitespace prefix [...] -> true', () => {
    expect(shouldSkipExtraction('  [Airbnb message — body non estratto]  ')).toBe(true);
  });

  it('body normale -> false', () => {
    expect(shouldSkipExtraction('Ciao, posso fare check-in alle 16?')).toBe(false);
  });

  it('body con [parentesi] non placeholder (apre ma non chiude) -> false', () => {
    expect(shouldSkipExtraction('[ho una domanda sul wifi')).toBe(false);
  });
});

describe('MESSAGE_TOPICS', () => {
  it('vocabolario chiuso ha 20 valori', () => {
    expect(MESSAGE_TOPICS).toHaveLength(20);
  });

  it('include i topics critici', () => {
    expect(MESSAGE_TOPICS).toContain('keybox');
    expect(MESSAGE_TOPICS).toContain('parking');
    expect(MESSAGE_TOPICS).toContain('wifi');
    expect(MESSAGE_TOPICS).toContain('complaint');
    expect(MESSAGE_TOPICS).toContain('other');
  });

  it('tutti i valori sono unique', () => {
    expect(new Set(MESSAGE_TOPICS).size).toBe(MESSAGE_TOPICS.length);
  });
});
