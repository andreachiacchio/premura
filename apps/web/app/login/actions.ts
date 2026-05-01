"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Server action per il magic link login.
//
// Ritorna { ok: true } al successo o { error: string } in caso di
// errore (validazione zod o chiamata Supabase). Niente throw: il
// LoginForm (client) usa il return per pilotare lo stato UI.
//
// emailRedirectTo: ricostruito dal request origin via next/headers
// per supportare automaticamente staging/production senza una env
// var dedicata. Se serve override (es. magic link cross-domain), si
// puo' aggiungere NEXT_PUBLIC_SITE_URL in slice futuro.

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Inserisci una email valida");

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInWithMagicLink(
  email: string,
  redirectTo?: string,
): Promise<SignInResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Email non valida",
    };
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "premura.it"}`;

  // Pattern Supabase ssr: il param "next" viaggia attraverso emailRedirectTo,
  // viene preservato letteralmente nel link email e ritorna in /auth/callback.
  // Stateless, niente cookie temporanei, robusto cross-device.
  const callbackUrl = redirectTo
    ? `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`
    : `${origin}/auth/callback`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: callbackUrl,
    },
  });

  if (error) {
    return {
      ok: false,
      error: `Invio non riuscito: ${error.message}`,
    };
  }
  return { ok: true };
}
