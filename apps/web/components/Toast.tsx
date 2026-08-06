'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Toast — conferma che un'azione e' andata a buon fine, e sparisce.
//
// Serve perche' dopo un'azione la card esce dalla lista: senza una riga
// di conferma l'host vede solo qualcosa che scompare, e non sa se ha
// funzionato o se ha sbagliato a cliccare.
//
// Volutamente minimale: niente vibrazione (navigator.vibrate non esiste
// su Safari iOS), niente animazioni elaborate, niente coda di piu'
// toast sovrapposti — l'ultimo messaggio sostituisce il precedente.
// role="status" + aria-live="polite" perche' uno screen reader lo legga
// senza interrompere quello che sta dicendo.

const AUTO_DISMISS_MS = 3000;

type ToastContextValue = {
  /** Mostra un messaggio. Sostituisce quello eventualmente a schermo. */
  show: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Fuori da un ToastProvider non lancia: ritorna una funzione che non fa
 * niente. Un componente che vuole confermare un'azione non deve poter
 * rompere la pagina solo perche' e' stato montato altrove.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { show: () => {} };
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), AUTO_DISMISS_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Sopra la bottom nav su mobile (la nav e' alta 64px piu' la
          safe area dell'iPhone); da lg la nav e' laterale e il toast
          torna in basso a destra. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex justify-center px-5 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:justify-end"
      >
        {message ? (
          <p className="pointer-events-auto max-w-[520px] rounded-card border border-line bg-ink px-4 py-3 text-body text-paper shadow-sm">
            {message}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
