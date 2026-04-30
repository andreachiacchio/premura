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

import { GET } from "@/app/auth/callback/route";

function makeRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

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

  it("code valido -> chiama exchangeCodeForSession e redirect a /dashboard", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest("https://premura.it/auth/callback?code=abc123"),
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
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
