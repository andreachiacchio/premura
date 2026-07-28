import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Il barrel @premura/shared finisce nel bundle browser di Next:
 * apps/web/lib/types.ts lo importa ed è a sua volta importato da client
 * component (dashboard/_components/BookingRow.tsx). Un modulo che tira
 * dentro un built-in Node fa fallire il build con UnhandledSchemeError
 * anche se la funzione non viene mai invocata lato client.
 *
 * È già successo con consent-ip.ts (node:crypto): build Vercel e CI
 * rossi. Questo test rende quell'errore impossibile da ripetere senza
 * accorgersene.
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Import di built-in Node, sia 'node:x' sia la forma nuda 'fs'. */
const NODE_BUILTIN_IMPORT =
  /from\s+['"](node:[a-z_/]+|fs|path|crypto|os|child_process|http|https|net|stream|zlib|worker_threads)['"]/;

function readSource(file: string): string {
  return readFileSync(join(SRC_DIR, file), 'utf8');
}

/** File .ts esportati dal barrel via `export * from './x'`. */
function barrelReExports(): string[] {
  const barrel = readSource('index.ts');
  return [...barrel.matchAll(/export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

describe('barrel @premura/shared — sicuro per il browser', () => {
  it('non ri-esporta moduli che importano built-in Node', () => {
    const colpevoli = barrelReExports().filter((mod) =>
      NODE_BUILTIN_IMPORT.test(readSource(`${mod}.ts`)),
    );

    expect(
      colpevoli,
      `Questi moduli importano built-in Node e non possono stare nel barrel (rompono il build di Next): ${colpevoli.join(', ')}. Toglili da src/index.ts e importali dal percorso diretto, es. import { x } from '@premura/shared/src/${colpevoli[0] ?? 'modulo'}'.`,
    ).toEqual([]);
  });

  it('consent-ip resta fuori dal barrel: usa node:crypto', () => {
    expect(NODE_BUILTIN_IMPORT.test(readSource('consent-ip.ts'))).toBe(true);
    expect(barrelReExports()).not.toContain('consent-ip');
  });

  it('il barrel copre tutti i moduli browser-safe: nessuna dimenticanza', () => {
    // Un modulo senza built-in Node dovrebbe essere esportato dal
    // barrel. Se ne aggiungi uno e scordi l'export, questo test lo dice.
    const moduli = readdirSync(SRC_DIR)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''));

    const browserSafe = moduli.filter((mod) => !NODE_BUILTIN_IMPORT.test(readSource(`${mod}.ts`)));
    const esportati = barrelReExports();

    expect(browserSafe.filter((mod) => !esportati.includes(mod))).toEqual([]);
  });
});
