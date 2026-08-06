import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from '@/app/dashboard/_components/EmptyState';

afterEach(cleanup);

// 06/08: EmptyState e' diventato riutilizzabile (prima diceva una frase
// sola, cablata). Quello che i test difendono non e' il layout ma il
// TONO: lo stato vuoto descrive lo stato, non celebra un successo che
// non c'e'.

describe('EmptyState', () => {
  it('mostra la frase principale', () => {
    render(<EmptyState>Nessuno in casa stanotte.</EmptyState>);
    expect(screen.getByText('Nessuno in casa stanotte.')).toBeInTheDocument();
  });

  it("mostra la riga secondaria solo quando c'e'", () => {
    const { rerender } = render(<EmptyState>Nessun arrivo in programma.</EmptyState>);
    expect(screen.queryByText(/calendario/i)).toBeNull();

    rerender(
      <EmptyState hint="Il calendario è aggiornato.">Nessun arrivo in programma.</EmptyState>,
    );
    expect(screen.getByText('Il calendario è aggiornato.')).toBeInTheDocument();
  });

  it("mostra l'azione solo quando ne esiste una", () => {
    const { rerender } = render(<EmptyState>Niente da fare.</EmptyState>);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <EmptyState action={<button type="button">Aggiungi una prenotazione</button>}>
        Niente da fare.
      </EmptyState>,
    );
    expect(screen.getByRole('button', { name: 'Aggiungi una prenotazione' })).toBeInTheDocument();
  });

  // Il testo lo scrive chi usa il componente, ma il tono e' la regola.
  // Se un giorno questo test diventa scomodo, il problema e' la frase
  // nuova, non il test.
  it('i testi in uso descrivono lo stato, non lo celebrano', () => {
    for (const frase of [
      'Nessuno in casa stanotte.',
      'Nessun arrivo in programma.',
      'Nessun messaggio aperto. Ti scrivo solo se serve.',
    ]) {
      expect(frase).not.toMatch(/!/);
      expect(frase.toLowerCase()).not.toMatch(/perfetto|ottimo|bravo|complimenti|tutto ok/);
    }
  });
});
