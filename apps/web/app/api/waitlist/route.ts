import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createServerClient, waitlist, type ServerClient } from "@premura/db";
import {
  SOURCE_REF_REGEX,
  waitlistBodySchema,
  type WaitlistResponse,
} from "@/lib/waitlist-schema";
import { consume, extractClientIp } from "@/lib/rate-limit";

// Driver `postgres` non è edge-compatible, serve Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Singleton lazy del client DB. La route handler è re-eseguita per ogni
// invocation serverless, ma il modulo resta caldo finché l'istanza vive,
// quindi riusiamo la pool.
let clientPromise: Promise<ServerClient> | null = null;

function getClient(): Promise<ServerClient> {
  if (!clientPromise) {
    clientPromise = Promise.resolve(createServerClient());
  }
  return clientPromise;
}

function jsonResponse(body: WaitlistResponse, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export async function POST(request: Request): Promise<NextResponse> {
  // ─── Rate limit ─────────────────────────────────────────────
  const ip = extractClientIp(request.headers);
  const rl = consume(`waitlist:${ip}`);
  if (!rl.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "rate_limit",
        message: "Troppi tentativi. Riprova tra qualche minuto.",
      },
      {
        status: 429,
        headers: { "retry-after": String(rl.retryAfterSeconds) },
      },
    );
  }

  // ─── Parse + validazione body ───────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: "validation", message: "Body non valido." },
      { status: 400 },
    );
  }

  const parsed = waitlistBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Controlla l'email — non mi sembra valida.",
      },
      { status: 400 },
    );
  }

  // ─── Attribuzione (server-side, non dal body) ───────────────
  const url = new URL(request.url);
  const refParam = url.searchParams.get("ref");
  const source =
    refParam && SOURCE_REF_REGEX.test(refParam) ? refParam : "direct";
  const referrer = request.headers.get("referer")?.slice(0, 512) ?? null;

  // ─── Insert ─────────────────────────────────────────────────
  try {
    const { db } = await getClient();

    // Idempotenza: se esiste già, non rilanciare errore — rispondi "duplicate".
    const existing = await db
      .select({ id: waitlist.id })
      .from(waitlist)
      .where(eq(waitlist.email, parsed.data.email))
      .limit(1);

    if (existing.length > 0) {
      return jsonResponse({ ok: true, duplicate: true });
    }

    await db.insert(waitlist).values({
      email: parsed.data.email,
      fullName: parsed.data.fullName ?? null,
      propertyCount: parsed.data.propertyCount ?? null,
      source,
      referrer,
    });

    return jsonResponse({ ok: true, duplicate: false });
  } catch (err) {
    // Race condition: check-then-insert può perdere contro un secondo
    // submit concorrente. Il unique constraint protegge a DB; in quel caso
    // trattiamo come duplicate.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("waitlist_email_unique")) {
      return jsonResponse({ ok: true, duplicate: true });
    }

    console.error("[waitlist] insert failed", err);
    return jsonResponse(
      {
        ok: false,
        error: "server",
        message: "Qualcosa non va dalla nostra parte. Riprova tra poco.",
      },
      { status: 500 },
    );
  }
}
