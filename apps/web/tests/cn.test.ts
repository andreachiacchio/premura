import { describe, expect, it } from 'vitest';
import { cn } from '../lib/cn';

// 04/08 — regressione trovata dalla verifica landing: tailwind-merge
// senza config trattava i token font-size custom come colori, e
// text-body DOPO text-white cancellava text-white (bottoni illeggibili).
// Questi test inchiodano la classGroup di lib/cn.ts.

describe('cn - token tipografici custom vs colori', () => {
  it('conserva text-white quando segue un token di size (ordine Button reale)', () => {
    const got = cn('bg-ink text-white hover:bg-ink-deep', 'h-10 px-5 text-body');
    expect(got).toContain('text-white');
    expect(got).toContain('text-body');
  });

  it('conserva text-eyebrow accanto a un colore testo', () => {
    const got = cn('text-eyebrow uppercase font-semibold', 'text-ink-mute');
    expect(got).toContain('text-eyebrow');
    expect(got).toContain('text-ink-mute');
  });

  it('due token di SIZE in conflitto: vince l\'ultimo', () => {
    expect(cn('text-body', 'text-body-lg')).toBe('text-body-lg');
  });

  it('due COLORI in conflitto: vince l\'ultimo', () => {
    expect(cn('text-white', 'text-ink')).toBe('text-ink');
  });
});
