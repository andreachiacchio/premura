import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextResponseClass } from "next/server";

// Mock di createSupabaseMiddlewareClient per evitare la dipendenza da
// @supabase/ssr reale (e da env vars). Il middleware reale chiama
// supabase.auth.getUser() e poi decide la response in base al pathname.

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  // La response che ritorna getResponse(): per i test e' un
  // NextResponse.next() base.
  defaultResponse: null as NextResponse | null,
}));

vi.mock("@/lib/supabase-middleware", () => ({
  createSupabaseMiddlewareClient: vi.fn(() => ({
    supabase: { auth: { getUser: mocks.getUser } },
    getResponse: () => mocks.defaultResponse ?? NextResponseClass.next(),
  })),
}));

import { middleware } from "@/middleware";

function makeRequest(url: string): NextRequest {
  const u = new URL(url);
  return {
    url,
    nextUrl: Object.assign(u, {
      clone: () => new URL(url),
    }),
  } as unknown as NextRequest;
}

describe("middleware", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.defaultResponse = null;
  });

  it("user null + path /dashboard -> redirect /login con redirectTo", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(makeRequest("https://premura.it/dashboard"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fdashboard");
  });

  it("user null + path /dashboard/foo?x=1 -> redirectTo include path+search", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(
      makeRequest("https://premura.it/dashboard/foo?x=1"),
    );
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("redirectTo=%2Fdashboard%2Ffoo%3Fx%3D1");
  });

  it("user autenticato + path /dashboard -> pass (no redirect)", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    const res = await middleware(makeRequest("https://premura.it/dashboard"));
    // NextResponse.next() ha status 200 di default (i.e. nessun redirect)
    expect(res.headers.get("location")).toBeNull();
  });

  it("user null + path /login -> pass (login e' pubblica)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(makeRequest("https://premura.it/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("user null + path /api/whatever -> pass (api non protetta dal middleware)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(
      makeRequest("https://premura.it/api/waitlist"),
    );
    expect(res.headers.get("location")).toBeNull();
  });

  it("user null + path / -> pass (landing pubblica)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(makeRequest("https://premura.it/"));
    expect(res.headers.get("location")).toBeNull();
  });

  // Parte A (04/08): /properties era fuori dal middleware e un anonimo
  // prendeva un 500 dal throw di getCurrentHostId invece del login.
  it("user null + path /properties/new -> redirect /login con redirectTo", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(
      makeRequest("https://premura.it/properties/new"),
    );
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fproperties%2Fnew");
  });

  it("user null + path /connect-gmail -> redirect /login con redirectTo", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(
      makeRequest("https://premura.it/connect-gmail"),
    );
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fconnect-gmail");
  });
});
