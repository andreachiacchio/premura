import { getDb } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { type Database, hosts } from '@premura/db';
import type { User } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';

// Helper auth: risolve l'host dell'utente Supabase corrente.
//
// Punto 2 Parte A (04/08): hosts.id NON e' piu' auth.users.id. Il
// legame passa da hosts.auth_user_id (unique, migration 0036) e la
// riga hosts viene creata QUI al primo accesso (ensure idempotente):
// non esiste nessun trigger di signup, e prima di questa modifica un
// utente nuovo aveva sessione valida ma zero righe hosts -> onboarding
// in loop infinito (l'orfano del 28/07 e' esattamente questo caso).
//
// Idempotenza:
//   - lookup per auth_user_id -> trovato = ritorna
//   - riga con stessa email non ancora collegata -> ADOZIONE (set
//     auth_user_id), mai duplicato ne' sovrascrittura di dati
//   - altrimenti INSERT con ON CONFLICT DO NOTHING + rilettura (due
//     login concorrenti non creano due host)
//
// Da chiamare solo lato server. Il throw se non autenticato resta la
// difesa oltre il middleware.

export type CurrentHost = {
  id: string;
  onboardingCompleted: boolean;
  onboardingStep: string;
};

async function requireAuthUser(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw new Error(`[auth] supabase.auth.getUser failed: ${error.message}`);
  }
  if (!user) {
    throw new Error(
      '[auth] nessun utente autenticato. Il middleware dovrebbe aver ' +
        'redirezionato a /login prima di arrivare qui.',
    );
  }
  return user;
}

function fullNameFromUser(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const candidate = meta.full_name ?? meta.name ?? null;
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate.trim() : null;
}

/** Trova o crea (idempotente) la riga hosts per l'utente auth dato.
 *  Esportata per test e per il callback di login. */
export async function ensureHostForAuthUser(
  db: Database,
  user: Pick<User, 'id' | 'email' | 'user_metadata'>,
): Promise<CurrentHost> {
  const byAuthId = await db
    .select({
      id: hosts.id,
      onboardingCompleted: hosts.onboardingCompleted,
      onboardingStep: hosts.onboardingStep,
    })
    .from(hosts)
    .where(eq(hosts.authUserId, user.id))
    .limit(1);
  if (byAuthId[0]) return byAuthId[0];

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    throw new Error('[auth] utente Supabase senza email: impossibile creare host');
  }

  // Adozione: riga preesistente con la stessa email, mai collegata a
  // un utente auth (host storici creati a mano). Non si sovrascrive
  // nulla, si aggiunge solo il collegamento.
  const byEmail = await db
    .select({
      id: hosts.id,
      authUserId: hosts.authUserId,
      onboardingCompleted: hosts.onboardingCompleted,
      onboardingStep: hosts.onboardingStep,
    })
    .from(hosts)
    .where(eq(hosts.email, email))
    .limit(1);
  if (byEmail[0]) {
    if (byEmail[0].authUserId && byEmail[0].authUserId !== user.id) {
      throw new Error(
        `[auth] email ${email} gia' collegata a un altro utente auth: intervento manuale necessario`,
      );
    }
    if (!byEmail[0].authUserId) {
      await db.update(hosts).set({ authUserId: user.id }).where(eq(hosts.id, byEmail[0].id));
    }
    return {
      id: byEmail[0].id,
      onboardingCompleted: byEmail[0].onboardingCompleted,
      onboardingStep: byEmail[0].onboardingStep,
    };
  }

  await db
    .insert(hosts)
    .values({
      authUserId: user.id,
      email,
      fullName: fullNameFromUser(user as User),
    })
    .onConflictDoNothing({ target: hosts.authUserId });

  const created = await db
    .select({
      id: hosts.id,
      onboardingCompleted: hosts.onboardingCompleted,
      onboardingStep: hosts.onboardingStep,
    })
    .from(hosts)
    .where(eq(hosts.authUserId, user.id))
    .limit(1);
  if (!created[0]) {
    throw new Error('[auth] creazione host fallita: riga assente dopo insert');
  }
  return created[0];
}

/** Host corrente (riga garantita: la crea al primo accesso). */
export async function getCurrentHost(): Promise<CurrentHost> {
  const user = await requireAuthUser();
  const { db } = await getDb();
  return ensureHostForAuthUser(db, user);
}

/** Compat: tutto il codice esistente consuma l'hostId da qui. Ora e'
 *  hosts.id (chiave propria), NON piu' l'id Supabase. */
export async function getCurrentHostId(): Promise<string> {
  const host = await getCurrentHost();
  return host.id;
}

// Slice 6.5.2: ritorna l'access_token JWT della sessione Supabase
// corrente, da inoltrare come `Authorization: Bearer <token>` alle
// chiamate verso l'API Fastify protetta. Throw se nessuna sessione.
export async function getCurrentAccessToken(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`[auth] supabase.auth.getSession failed: ${error.message}`);
  }
  if (!session?.access_token) {
    throw new Error('[auth] nessuna sessione attiva, access_token mancante');
  }
  return session.access_token;
}
