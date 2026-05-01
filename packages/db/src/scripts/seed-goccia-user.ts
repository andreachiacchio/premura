// Slice 6 fase 3: crea il user Supabase Auth per La Goccia con UUID
// allineato a hosts.id esistente (2ad367f1-3433-4b42-b143-5ece3cd8bb5b).
//
// Va eseguito UNA VOLTA per ambiente (staging, poi production), DOPO
// la migration 0007_enable_rls.sql. Idempotente: se il user esiste
// gia' lo script esce con codice 0 senza errori.
//
// Uso:
//   pnpm tsx packages/db/src/scripts/seed-goccia-user.ts
//
// Sequenza completa di deploy: docs/MIGRATION-SLICE6.md.

import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Guard import-vs-script: questo modulo carica un client Supabase admin
// e lancia chiamate auth.admin.* a import time. Non deve mai essere
// importato da altri moduli (test, app, worker). Eseguito standalone via
// tsx il check passa; importato da qualsiasi altro entry, il throw a
// import time blocca subito.
//
// Resolve esplicito di process.argv[1] per coprire il caso in cui tsx
// venga lanciato con path relativo (es. da pnpm script): import.meta.url
// e' sempre assoluto file://, argv[1] no.
const scriptPath = process.argv[1] ? resolve(process.argv[1]) : "";
const isMainModule = import.meta.url === `file://${scriptPath}`;
if (!isMainModule) {
  throw new Error(
    "[seed-goccia-user] Questo script va eseguito standalone via tsx, " +
      "non importato come modulo.",
  );
}

// ─────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error(
    "[seed-goccia-user] env SUPABASE_URL mancante. Vedi docs/MIGRATION-SLICE6.md sezione 'Prerequisiti'.",
  );
  process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[seed-goccia-user] env SUPABASE_SERVICE_ROLE_KEY mancante. " +
      "Credenziale super-privilegiata, vedi docs/MIGRATION-SLICE6.md sezione 'Prerequisiti'.",
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Costanti dominio
// ─────────────────────────────────────────────────────────────

const GOCCIA_HOST_ID = "2ad367f1-3433-4b42-b143-5ece3cd8bb5b";
const GOCCIA_EMAIL = "c.farmabeauty@gmail.com";

// ─────────────────────────────────────────────────────────────
// Esecuzione
// ─────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { error } = await supabase.auth.admin.createUser({
  id: GOCCIA_HOST_ID,
  email: GOCCIA_EMAIL,
  email_confirm: true,
});

if (error) {
  // Idempotenza: Supabase ritorna messaggi diversi a seconda della
  // collisione (UUID gia' esistente, email gia' registrata). Tutti
  // questi casi sono "ok, gia' fatto" per noi.
  const msg = error.message.toLowerCase();
  const alreadyExists =
    msg.includes("already") ||
    msg.includes("duplicate") ||
    msg.includes("exists");
  if (alreadyExists) {
    console.log(
      `[seed-goccia-user] user gia' esistente, skip. id=${GOCCIA_HOST_ID} email=${GOCCIA_EMAIL}`,
    );
    process.exit(0);
  }
  console.error(
    `[seed-goccia-user] errore createUser: ${error.message} (status=${error.status ?? "n/a"})`,
  );
  process.exit(1);
}

console.log(
  `[seed-goccia-user] User Supabase creato per La Goccia: id=${GOCCIA_HOST_ID} email=${GOCCIA_EMAIL}`,
);
process.exit(0);
