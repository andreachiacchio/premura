"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import {
  MAX_PROPERTY_COUNT,
  MIN_PROPERTY_COUNT,
  waitlistBodySchema,
  type WaitlistResponse,
} from "@/lib/waitlist-schema";

type Placement = "hero" | "cta";

export interface WaitlistFormProps {
  placement: Placement;
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; propertyCount: number; duplicate: boolean }
  | { kind: "error"; message: string };

const ArrowRight = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 7h10M8 3l4 4-4 4" />
  </svg>
);

export function WaitlistForm({ placement }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [propertyCount, setPropertyCount] = useState<number>(1);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const submitting = status.kind === "submitting";
  const errored = status.kind === "error";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = waitlistBodySchema.safeParse({
      email,
      fullName: fullName.trim() === "" ? undefined : fullName,
      propertyCount,
    });

    if (!parsed.success) {
      setStatus({
        kind: "error",
        message:
          "Controlla l'email — non mi sembra valida.",
      });
      return;
    }

    setStatus({ kind: "submitting" });

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const json: WaitlistResponse = await res.json();

      if (json.ok) {
        setStatus({
          kind: "success",
          propertyCount,
          duplicate: json.duplicate,
        });
        return;
      }

      setStatus({
        kind: "error",
        message:
          json.error === "rate_limit"
            ? "Troppi tentativi. Riprova tra qualche minuto."
            : json.message ?? "Qualcosa non va. Riprova tra poco.",
      });
    } catch {
      setStatus({
        kind: "error",
        message: "Connessione caduta. Riprova tra poco.",
      });
    }
  }

  if (status.kind === "success") {
    return <SuccessCard propertyCount={status.propertyCount} duplicate={status.duplicate} />;
  }

  const emailId = `waitlist-email-${placement}`;
  const nameId = `waitlist-name-${placement}`;
  const countId = `waitlist-count-${placement}`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor={emailId} className="block text-body-sm font-semibold text-ink">
          La tua email
        </label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          placeholder="andrea@esempio.it"
          className={cn(
            "mt-2 w-full h-12 rounded-[12px] border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-ghost",
            "transition-colors focus-visible:outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/20",
            "disabled:opacity-60",
          )}
        />
      </div>

      <div>
        <label htmlFor={nameId} className="block text-body-sm font-semibold text-ink">
          Come ti chiami? <span className="font-normal text-ink-mute">(facoltativo)</span>
        </label>
        <input
          id={nameId}
          type="text"
          autoComplete="given-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={submitting}
          maxLength={255}
          placeholder="Andrea"
          className={cn(
            "mt-2 w-full h-12 rounded-[12px] border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-ghost",
            "transition-colors focus-visible:outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/20",
            "disabled:opacity-60",
          )}
        />
      </div>

      <div>
        <label id={countId} className="block text-body-sm font-semibold text-ink">
          Quante strutture gestisci?
        </label>
        <PropertyStepper
          labelledBy={countId}
          value={propertyCount}
          onChange={setPropertyCount}
          disabled={submitting}
        />
      </div>

      <Button
        type="submit"
        variant="accent"
        size="lg"
        disabled={submitting}
        rightIcon={submitting ? null : ArrowRight}
        className="w-full"
      >
        {submitting ? "Un secondo…" : "Entra nella waitlist"}
      </Button>

      {errored ? (
        <p role="alert" className="text-body-sm text-terracotta-2">
          {status.message}
        </p>
      ) : null}

      <p className="text-body-sm text-ink-mute">
        Iscrivendoti accetti di ricevere un&apos;email quando apriamo. Niente
        newsletter, niente rumore. Cancelli con un click, o leggi la{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 decoration-line hover:text-ink hover:decoration-ink"
        >
          privacy
        </Link>
        .
      </p>
    </form>
  );
}

// ─── Property stepper ──────────────────────────────────────────

interface PropertyStepperProps {
  labelledBy: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}

function PropertyStepper({ labelledBy, value, onChange, disabled }: PropertyStepperProps) {
  const dec = () => onChange(Math.max(MIN_PROPERTY_COUNT, value - 1));
  const inc = () => onChange(Math.min(MAX_PROPERTY_COUNT, value + 1));
  const atMin = value <= MIN_PROPERTY_COUNT;
  const atMax = value >= MAX_PROPERTY_COUNT;

  const displayValue = value >= 6 ? "6+" : String(value);
  const displayLabel =
    value === 1 ? "1 struttura" : value >= 6 ? "6+ strutture" : `${value} strutture`;

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={cn(
        "mt-2 flex items-center gap-4 p-2 rounded-full bg-ivory-warm",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={dec}
        disabled={disabled || atMin}
        aria-label="Togli una struttura"
        className={cn(
          "w-10 h-10 rounded-full bg-paper text-ink text-h3 font-serif shadow-sm grid place-items-center",
          "transition-transform active:scale-90",
          "disabled:opacity-35 disabled:cursor-not-allowed disabled:active:scale-100",
        )}
      >
        −
      </button>

      <div className="flex-1 text-center">
        <div
          aria-live="polite"
          className="font-serif text-h3 text-ink leading-none tabular-nums"
        >
          {displayValue}
        </div>
        <div className="mt-1 text-body-sm text-ink-mute">{displayLabel}</div>
      </div>

      <button
        type="button"
        onClick={inc}
        disabled={disabled || atMax}
        aria-label="Aggiungi una struttura"
        className={cn(
          "w-10 h-10 rounded-full bg-paper text-ink text-h3 font-serif shadow-sm grid place-items-center",
          "transition-transform active:scale-90",
          "disabled:opacity-35 disabled:cursor-not-allowed disabled:active:scale-100",
        )}
      >
        +
      </button>
    </div>
  );
}

// ─── Success state ─────────────────────────────────────────────

interface SuccessCardProps {
  propertyCount: number;
  duplicate: boolean;
}

function SuccessCard({ propertyCount, duplicate }: SuccessCardProps) {
  const countLabel =
    propertyCount === 1
      ? "1 struttura"
      : propertyCount >= 6
        ? "6+ strutture"
        : `${propertyCount} strutture`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[16px] border border-line bg-paper p-6 md:p-8 shadow-sm"
    >
      <div className="flex items-center gap-3 text-terracotta-2">
        <span
          aria-hidden="true"
          className="grid place-items-center w-7 h-7 rounded-full bg-terracotta-soft text-terracotta-2 font-semibold"
        >
          ✓
        </span>
        <span className="text-eyebrow uppercase font-semibold">
          {duplicate ? "Ti ho già in lista" : "Ti ho presa"}
        </span>
      </div>

      <p className="mt-4 font-serif text-h3 text-ink leading-snug">
        {duplicate
          ? "Eri già con me. Grazie ancora."
          : "Ti scrivo io, quando è il momento."}
      </p>

      <p className="mt-3 text-body text-ink-soft">
        Registrata per <strong className="font-semibold text-ink">{countLabel}</strong>.
        Nessun rumore nel frattempo.
      </p>

      <p className="mt-5 text-body-sm text-ink-mute">
        — Andrea
      </p>
    </div>
  );
}

export default WaitlistForm;
