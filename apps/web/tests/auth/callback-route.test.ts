import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Mock di createSupabaseServerClient: il route handler lo importa
// e chiama exchangeCodeForSession. Usiamo vi.hoisted per definire
// le mock fn cui poter accedere dentro vi.mock factory.

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  })),
}));

import { GET, safeNext } from "@/app/auth/callback/route";

function makeRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

describe("safeNext", () => {
  // 5 casi di rifiuto -> fallback /dashboard
  it("rifiuta null", () => {
    expect(safeNext(null)).toBe("/dashboard");
  });
  it("rifiuta path > 200 char", () => {
    const long = "/" + "a".repeat(250);
    expect(safeNext(long)).toBe("/dashboard");
  });
  it("rifiuta URL assoluti (non parte con /)", () => {
    expect(safeNext("https://evil.com/steal")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });
  it("rifiuta path protocol-relative (//evil.com)", () => {
    expect(safeNext("//evil.com/steal")).toBe("/dashboard");
  });
  it("rifiuta path con sequenze % malformate", () => {
    expect(safeNext("/foo%E0%A4")).toBe("/dashboard");
  });

  // 2 casi di success
  it("accetta /foo", () => {
    expect(safeNext("/foo")).toBe("/foo");
  });
  it("accetta /dashboard/incomplete", () => {
    expect(safeNext("/dashboard/incomplete")).toBe("/dashboard/incomplete");
  });
});

describe("GET /auth/callback", () => {
  beforeEach(() => {
    mocks.exchangeCodeForSession.mockReset();
  });

  it("code mancante -> redirect a /login?error=missing_code", async () => {
    const res = await GET(makeRequest("https://premura.it/auth/callback"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://premura.it/login?error=missing_code",
    );
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("code valido senza next -> exchangeCodeForSession + redirect /dashboard", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest("https://premura.it/auth/callback?code=abc123"),
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://premura.it/dashboard");
  });

  it("code valido con next safe -> redirect al next", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest(
        "https://premura.it/auth/callback?code=abc123&next=%2Fdashboard%2Fincomplete",
      ),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://premura.it/dashboard/incomplete",
    );
  });

  it("code valido con next malizioso -> redirect a /dashboard fallback", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest(
        "https://premura.it/auth/callback?code=abc&next=https%3A%2F%2Fevil.com",
      ),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://premura.it/dashboard");
  });

  it("exchange fallito -> redirect a /login?error=exchange_failed", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid grant" },
    });
    const res = await GET(
      makeRequest("https://premura.it/auth/callback?code=stale"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://premura.it/login?error=exchange_failed",
    );
  });
});
