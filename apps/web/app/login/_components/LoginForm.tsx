"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithGoogle, signInWithMagicLink, type SignInResult } from "../actions";

// Parte A (04/08, A1): "Continua con Google" e' il percorso primario
// (signInWithGoogle fa redirect al consent — il throw NEXT_REDIRECT
// naviga da solo); il magic link resta come alternativa senza Google.
//
// errorCode arriva via prop dalla searchParam ?error= di /auth/callback:
// e' separato dallo stato di submit del form (un utente puo' caricare
// /login?error=missing_code direttamente).

const GoogleG = (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

type FormState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "Link non valido, riprova",
  exchange_failed: "Sessione scaduta, riprova",
  oauth_unavailable:
    "Accesso con Google non disponibile in questo momento: entra con l'email qui sotto",
};

function callbackErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Qualcosa e' andato storto";
}

export function LoginForm({
  errorCode,
  redirectTo,
  signInAction = signInWithMagicLink,
  googleAction = signInWithGoogle,
}: {
  errorCode: string | null;
  redirectTo: string | null;
  signInAction?: (
    email: string,
    redirectTo?: string,
  ) => Promise<SignInResult>;
  googleAction?: (redirectTo?: string) => Promise<SignInResult>;
}) {
  const [state, setState] = React.useState<FormState>({ kind: "idle" });
  const [email, setEmail] = React.useState("");
  const callbackError = callbackErrorMessage(errorCode);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ kind: "sending" });
    const result = await signInAction(email, redirectTo ?? undefined);
    if (result.ok) {
      setState({ kind: "sent", email });
    } else {
      setState({ kind: "error", message: result.error });
    }
  }

  if (state.kind === "sent") {
    return (
      <div
        role="status"
        className="rounded-card border border-line-soft bg-paper p-6"
      >
        <p className="font-serif text-h3 leading-tight text-ink">
          Controlla la tua email.
        </p>
        <p className="mt-2 text-body text-ink-soft">
          Ti abbiamo inviato un link a <strong>{state.email}</strong>. Aprilo
          dallo stesso dispositivo per accedere.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {callbackError ? (
        <p
          role="alert"
          className="rounded-card border border-terracotta-soft bg-peach px-4 py-3 text-body-sm font-medium text-terracotta-2"
        >
          {callbackError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="accent"
        size="lg"
        className="w-full"
        disabled={state.kind === "sending"}
        onClick={async () => {
          setState({ kind: "sending" });
          // Se il redirect al consent parte, questa await non ritorna
          // (Next naviga). Un ritorno = errore (es. provider disabilitato).
          const result = await googleAction(redirectTo ?? undefined);
          if (!result.ok) {
            setState({ kind: "error", message: result.error });
          }
        }}
      >
        <span className="inline-flex items-center gap-2.5">
          {GoogleG}
          Continua con Google
        </span>
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line-soft" />
        <span className="text-body-sm text-ink-mute">oppure via email</span>
        <span className="h-px flex-1 bg-line-soft" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">La tua email</Label>
        <Input
          id="login-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="nome@esempio.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state.kind === "sending"}
        />
      </div>

      <Button
        type="submit"
        variant="accent"
        size="lg"
        disabled={state.kind === "sending" || email.trim().length === 0}
      >
        {state.kind === "sending" ? "Invio..." : "Invia link di accesso"}
      </Button>

      {state.kind === "error" ? (
        <p role="alert" className="text-body-sm font-medium text-alert">
          {state.message}
        </p>
      ) : null}
      </form>
    </div>
  );
}
