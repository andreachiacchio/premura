import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LoginForm } from "./_components/LoginForm";

// Server component: render della pagina /login.
//
// Se l'utente e' gia' autenticato, redirect immediato a /dashboard
// (niente flash di login form). Altrimenti mostra il form magic link.
//
// La query string ?error=<code> arriva da /auth/callback in caso di
// scambio fallito; il messaggio italiano corrispondente lo decide
// LoginForm (client component).

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { error, redirectTo } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-ivory px-5 pt-16 pb-8">
      <header className="mb-10">
        <h1 className="font-serif text-h2 leading-tight text-ink">
          Entra in Premura
        </h1>
        <p className="mt-3 text-body text-ink-soft">
          Inserisci la tua email. Ti mandiamo un link di accesso, niente
          password da ricordare.
        </p>
      </header>

      <LoginForm errorCode={error ?? null} redirectTo={redirectTo ?? null} />

      <footer className="mt-auto pt-12 text-center text-body-sm text-ink-mute">
        Premura - il concierge che non dorme mai.
      </footer>
    </main>
  );
}
