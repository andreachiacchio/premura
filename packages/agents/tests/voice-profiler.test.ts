import { describe, expect, it } from 'vitest';
import { shouldSkipVoiceUpdate } from '../src/voice-profiler';

describe('shouldSkipVoiceUpdate', () => {
  it('body vuoto -> true', () => {
    expect(shouldSkipVoiceUpdate('')).toBe(true);
  });

  it('body 9 char -> true', () => {
    expect(shouldSkipVoiceUpdate('123456789')).toBe(true);
  });

  it('body 10 char -> false', () => {
    expect(shouldSkipVoiceUpdate('1234567890')).toBe(false);
  });

  it('body placeholder [...] -> true', () => {
    expect(shouldSkipVoiceUpdate('[Booking message — apri Extranet]')).toBe(true);
  });

  it('body normale outbound host -> false', () => {
    expect(shouldSkipVoiceUpdate('Ciao Mario, ti scrivo le info pratiche su WhatsApp')).toBe(false);
  });

  it('body con whitespace -> trim prima del check', () => {
    expect(shouldSkipVoiceUpdate('   [placeholder]   ')).toBe(true);
  });
});
