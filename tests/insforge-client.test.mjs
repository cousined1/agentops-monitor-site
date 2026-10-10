import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/lib/insforge.ts. Only the external SDK
// boundary (@insforge/sdk/ssr) and next/headers are mocked; the module's own
// functions under test run for real. Mirrors tests/backend-security.test.mjs.
const { createBrowserClient, createServerClient, createAuthActions, cookies, headers } =
  vi.hoisted(() => ({
    createBrowserClient: vi.fn(() => ({ kind: "browser" })),
    createServerClient: vi.fn(),
    createAuthActions: vi.fn(() => ({ kind: "auth-actions" })),
    cookies: vi.fn(async () => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    })),
    headers: vi.fn(async () => ({ get: vi.fn() })),
  }));

vi.mock("@insforge/sdk/ssr", () => ({
  createBrowserClient,
  createServerClient,
  createAuthActions,
}));

vi.mock("next/headers", () => ({ cookies, headers }));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

describe("lib/insforge client factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, BASE_ENV);
  });

  it("getBrowserClient throws when the public env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_INSFORGE_URL;
    const { getBrowserClient } = await import("../src/lib/insforge.ts");

    expect(() => getBrowserClient()).toThrow(
      /NEXT_PUBLIC_INSFORGE_URL and NEXT_PUBLIC_INSFORGE_ANON_KEY must be defined/,
    );
    expect(createBrowserClient).not.toHaveBeenCalled();
  });

  it("getBrowserClient builds a client from the public env vars", async () => {
    const { getBrowserClient } = await import("../src/lib/insforge.ts");

    const client = getBrowserClient();

    expect(client).toEqual({ kind: "browser" });
    expect(createBrowserClient).toHaveBeenCalledWith({
      baseUrl: BASE_ENV.NEXT_PUBLIC_INSFORGE_URL,
      anonKey: BASE_ENV.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    });
  });

  it("getServerClient wires a cookie getter that maps present and absent cookies", async () => {
    cookies.mockResolvedValue({
      get: vi.fn((name) => (name === "session" ? { value: "cookie-value" } : undefined)),
      set: vi.fn(),
      delete: vi.fn(),
    });
    const { getServerClient } = await import("../src/lib/insforge.ts");

    await getServerClient();

    expect(createServerClient).toHaveBeenCalledTimes(1);
    const config = createServerClient.mock.calls[0][0];
    expect(config.cookies.get("session")).toEqual({ value: "cookie-value" });
    expect(config.cookies.get("missing")).toBeUndefined();
    expect(config.baseUrl).toBe(BASE_ENV.NEXT_PUBLIC_INSFORGE_URL);
  });

  it("getSessionUser returns the session user on success", async () => {
    const user = { id: "user-1", email: "team@example.com" };
    createServerClient.mockResolvedValue({
      auth: { getCurrentUser: vi.fn(async () => ({ data: { user }, error: null })) },
    });
    const { getSessionUser } = await import("../src/lib/insforge.ts");

    await expect(getSessionUser()).resolves.toEqual(user);
  });

  it("getSessionUser treats an auth outage as 'no session' instead of throwing", async () => {
    createServerClient.mockResolvedValue({
      auth: { getCurrentUser: vi.fn(async () => ({ data: null, error: null })) },
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { getSessionUser } = await import("../src/lib/insforge.ts");
      const client = await createServerClient();
      client.auth.getCurrentUser.mockRejectedValueOnce(new Error("insforge down"));

      await expect(getSessionUser()).resolves.toBeNull();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("getAuthActions builds auth actions from the server env", async () => {
    const cookieStore = { get: vi.fn() };
    cookies.mockResolvedValue(cookieStore);
    const { getAuthActions } = await import("../src/lib/insforge.ts");

    const actions = await getAuthActions();

    expect(actions).toEqual({ kind: "auth-actions" });
    expect(createAuthActions).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: BASE_ENV.NEXT_PUBLIC_INSFORGE_URL,
        cookies: cookieStore,
      }),
    );
  });
});
