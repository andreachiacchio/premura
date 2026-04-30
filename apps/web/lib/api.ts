// Client HTTP verso l'API Fastify (apps/api) per le mutazioni bookings.
//
// Le LETTURE non passano da qui: leggono direttamente da Postgres via
// repository drizzle (vedi apps/web/lib/repositories/bookings.ts
// findByHostId). Le mutazioni invece passano dall'API perche
// /complete-manual triggera il workflow agente AI on-new-booking.
//
// Base URL: API_URL (server-side) ha priorita su NEXT_PUBLIC_API_URL.
// In production il server component legge API_URL dall'env Vercel.

const apiBaseUrl = (): string => {
  const url = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "[api] env var API_URL o NEXT_PUBLIC_API_URL mancante. " +
        "Imposta es. https://premura-api-staging.fly.dev",
    );
  }
  return url.replace(/\/$/, "");
};

export type CompleteBookingPayload = {
  guestFullName: string;
  guestPhone: string;
  guestLanguage?: string;
  numGuests?: number;
};

export async function completeBookingManual(
  bookingId: string,
  payload: CompleteBookingPayload,
): Promise<void> {
  const res = await fetch(
    `${apiBaseUrl()}/api/bookings/${bookingId}/complete-manual`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `[api] complete-manual failed: ${res.status} ${text || "(no body)"}`,
    );
  }
}

export async function skipBookingCompletion(bookingId: string): Promise<void> {
  // KNOWN-LIMITS sezione 17: il body parser di Fastify rifiuta richieste
  // con Content-Type: application/json e body vuoto. Inviamo '{}' per
  // restare simmetrici al complete-manual senza scatenare il 400.
  const res = await fetch(
    `${apiBaseUrl()}/api/bookings/${bookingId}/skip-completion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `[api] skip-completion failed: ${res.status} ${text || "(no body)"}`,
    );
  }
}
