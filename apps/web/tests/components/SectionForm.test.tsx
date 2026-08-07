import { SectionForm } from '@/app/properties/[propertyId]/knowledge/_components/SectionForm';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

// 07/08. Questi test difendono una cosa sola, ed e' R2: quello che il
// form dice all'host deve derivare dall'esito della server action, non
// dal fatto che la richiesta sia semplicemente finita.
//
// Il caso che rompe tutto e' il terzo: se «Salvato» comparisse anche
// quando l'azione lancia — e succede, perche' anche un'azione fallita
// smette di essere pending — l'host chiuderebbe la pagina convinto di
// aver salvato la password del WiFi.

function Campo(): React.JSX.Element {
  return <input name="ssid" aria-label="Nome rete" defaultValue="" />;
}

describe('SectionForm', () => {
  it('non dice niente finche non si tocca niente', () => {
    render(
      <SectionForm action={vi.fn()}>
        <Campo />
      </SectionForm>,
    );
    expect(screen.queryByText('Salvato')).toBeNull();
    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
  });

  it('avvisa che ci sono modifiche non salvate appena si scrive', async () => {
    const user = userEvent.setup();
    render(
      <SectionForm action={vi.fn()}>
        <Campo />
      </SectionForm>,
    );

    await user.type(screen.getByLabelText('Nome rete'), 'Casa');

    expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();
    expect(screen.queryByText('Salvato')).toBeNull();
  });

  it('conferma solo dopo che azione e tornata senza lanciare', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue(undefined);
    render(
      <SectionForm action={action}>
        <Campo />
      </SectionForm>,
    );

    await user.type(screen.getByLabelText('Nome rete'), 'Casa');
    await user.click(screen.getByRole('button', { name: 'Salva sezione' }));

    await waitFor(() => expect(screen.getByText('Salvato')).toBeInTheDocument());
    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
  });

  it('se azione lancia lo dice e non perde quello che era scritto', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockRejectedValue(new Error('salvataggio fallito'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <SectionForm action={action}>
        <Campo />
      </SectionForm>,
    );

    await user.type(screen.getByLabelText('Nome rete'), 'Casa');
    await user.click(screen.getByRole('button', { name: 'Salva sezione' }));

    await waitFor(() =>
      expect(screen.getByText(/Non sono riuscito a salvare/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Salvato')).toBeNull();
    // Il testo dell'host e' ancora nel campo: e' il punto di tutto.
    expect(screen.getByLabelText('Nome rete')).toHaveValue('Casa');
  });

  it('la conferma sparisce appena si ricomincia a modificare', async () => {
    const user = userEvent.setup();
    render(
      <SectionForm action={vi.fn().mockResolvedValue(undefined)}>
        <Campo />
      </SectionForm>,
    );

    await user.type(screen.getByLabelText('Nome rete'), 'Casa');
    await user.click(screen.getByRole('button', { name: 'Salva sezione' }));
    await waitFor(() => expect(screen.getByText('Salvato')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Nome rete'), 'Mia');

    expect(screen.queryByText('Salvato')).toBeNull();
    expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();
  });
});
