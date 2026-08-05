// Strumentazione temporanea (05/08, ordine Andrea: "riporta i numeri
// misurati prima di cambiare qualcosa").
//
// Non cambia NESSUN comportamento: misura e scrive una riga sui log
// runtime di Vercel. Serve a separare i tre costi che oggi si sommano
// a ogni cambio di sezione:
//   - auth.getUser() nel middleware  (round-trip HTTP a Supabase Auth)
//   - auth.getUser() + lookup hosts  (di nuovo, dentro getCurrentHost)
//   - le query di pagina             (serializzate: pool max=1)
//
// Da rimuovere quando l'ottimizzazione e' misurata e chiusa.

const PREFIX = '[perf]';

/** Misura una promise e logga `label` con i ms. Rilancia invariato. */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  let esito = 'ok';
  try {
    return await fn();
  } catch (err) {
    esito = 'ERR';
    throw err;
  } finally {
    console.log(`${PREFIX} ${label} ${Math.round(performance.now() - t0)}ms ${esito}`);
  }
}

/** Cronometro esplicito per i punti dove non c'e' una singola promise
 *  da avvolgere (es. il corpo di una pagina con return multipli). */
export function startTimer(label: string): () => void {
  const t0 = performance.now();
  let chiuso = false;
  return () => {
    if (chiuso) return;
    chiuso = true;
    console.log(`${PREFIX} ${label} ${Math.round(performance.now() - t0)}ms`);
  };
}
