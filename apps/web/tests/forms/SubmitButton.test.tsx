import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// BUG-001 TASK A — Test SubmitButton.
//
// useFormStatus va mockato perche' richiede un <form action={...}> parent
// con server action context attivo (non disponibile in jsdom test pure).
// Mockando react-dom.useFormStatus possiamo testare entrambi i path
// (pending=true / pending=false) senza setup complesso.

const useFormStatusMock = vi.fn();
vi.mock('react-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useFormStatus: () => useFormStatusMock() };
});

import { SubmitButton } from '@/components/forms/SubmitButton';

afterEach(() => {
  cleanup();
  useFormStatusMock.mockReset();
});

describe('SubmitButton — idle state', () => {
  it('renderizza children come label', () => {
    useFormStatusMock.mockReturnValue({ pending: false });
    render(<SubmitButton>Continua</SubmitButton>);
    expect(screen.getByRole('button', { name: 'Continua' })).toBeInTheDocument();
  });

  it("non e' disabled quando pending=false", () => {
    useFormStatusMock.mockReturnValue({ pending: false });
    render(<SubmitButton>Continua</SubmitButton>);
    const btn = screen.getByRole('button', { name: 'Continua' });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'false');
  });

  it('type=submit per default', () => {
    useFormStatusMock.mockReturnValue({ pending: false });
    render(<SubmitButton>Salva</SubmitButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});

describe('SubmitButton — pending state', () => {
  it('mostra pendingLabel quando pending=true', () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<SubmitButton pendingLabel="Procedo…">Continua</SubmitButton>);
    expect(screen.getByRole('button', { name: 'Procedo…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continua' })).not.toBeInTheDocument();
  });

  it('fallback default pendingLabel "Attendere…"', () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<SubmitButton>Continua</SubmitButton>);
    expect(screen.getByRole('button', { name: 'Attendere…' })).toBeInTheDocument();
  });

  it("e' disabled + aria-busy quando pending=true", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<SubmitButton pendingLabel="Salvataggio…">Salva</SubmitButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('classe cursor-wait su pending (variant default)', () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<SubmitButton>Salva</SubmitButton>);
    expect(screen.getByRole('button').className).toContain('cursor-wait');
  });
});

describe('SubmitButton — asSkip variant', () => {
  it('renderizza come link-like (no Button design system)', () => {
    useFormStatusMock.mockReturnValue({ pending: false });
    render(<SubmitButton asSkip>Lo aggiungo dopo</SubmitButton>);
    const btn = screen.getByRole('button', { name: 'Lo aggiungo dopo' });
    expect(btn.className).toContain('underline');
    expect(btn.className).toContain('text-ink-mute');
  });

  it('pendingLabel anche per asSkip', () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(
      <SubmitButton asSkip pendingLabel="Salto…">
        Lo aggiungo dopo
      </SubmitButton>,
    );
    expect(screen.getByRole('button', { name: 'Salto…' })).toBeInTheDocument();
  });

  it('asSkip disabled + aria-busy + cursor-wait quando pending', () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<SubmitButton asSkip>Skip</SubmitButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.className).toContain('cursor-wait');
  });
});
