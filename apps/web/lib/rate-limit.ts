// Rate limiter IP-based in-memory.
//
// LIMITE NOTO: su Vercel serverless ogni istanza ha la propria Map. Non è
// un rate limit vero — è best-effort anti-spam per waitlist pre-lancio.
// Documentato in docs/KNOWN-LIMITS.md §7. Se la landing prende traffico
// virale, migrare a Upstash Ratelimit.

type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 5 * 60 * 1000; // 5 minuti
const MAX_REQUESTS = 3;

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

// Consuma una richiesta per la chiave data. Ritorna se permessa e quanta
// finestra resta. Pulisce entry scadute pigramente (niente interval timer,
// che non sopravvive tra invocation serverless).
export function consume(key: string, now: number = Date.now()): RateLimitResult {
  cleanup(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count };
}

// Estrae IP client da header forwarded. Vercel mette l'IP originale in
// `x-forwarded-for` (primo valore della lista CSV). Fallback ordine:
// x-real-ip, cf-connecting-ip (Cloudflare), poi "unknown".
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

function cleanup(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Esposto per test unitari.
export function _resetForTests(): void {
  buckets.clear();
}
