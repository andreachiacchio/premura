"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithMagicLink, type SignInResult } from "../actions";

// Form magic link: 1 input email + 1 bottone. Stato locale tracciato
// con union type "idle | sending | sent | error". Quando inviato con
// successo, sostituiamo il form con la conferma "ti abbiamo inviato".
//
// errorCode arriva via prop dalla searchParam ?error= di /auth/callback:
// e' separato dallo stato di submit del form (un utente puo' caricare
// /login?error=missing_code direttamente).

type FormState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "Link non valido, riprova",
  exchange_failed: "Sessione scaduta, riprova",
};

function callbackErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Qualcosa e' andato storto";
}

export function LoginForm({
  errorCode,
  redirectTo,
  signInAction = signInWithMagicLink,
}: {
  errorCode: string | null;
  redirectTo: string | null;
  signInAction?: (
    email: string,
    redirectTo?: string,
  ) => Promise<SignInResult>;
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {callbackError ? (
        <p
          role="alert"
          className="rounded-card border border-terracotta-soft bg-peach px-4 py-3 text-body-sm font-medium text-terracotta-2"
        >
          {callbackError}
        </p>
      ) : null}

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
  );
}
