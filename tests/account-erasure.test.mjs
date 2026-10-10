import { beforeEach, describe, expect, it, vi } from "vitest";

// Coverage for src/app/api/account/route.ts. The route erases every table that
// holds tenant data. Only external seams are mocked (InsForge clients,
// next/cache); the real handler runs throughout.
const { getServerClient, createAdminClient } = vi.hoisted(() => ({
  getServerClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/insforge", () => ({ getServerClient }));
vi.mock("@insforge/sdk", () => ({ createAdminClient }));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

const USER_ID = "user-erase-1";

function sessionClient({ authError = null, user = { id: USER_ID, email: "erase@example.com" } } = {}) {
  return {
    auth: {
      getCurrentUser: vi.fn(async () => ({ data: { user }, error: authError })),
    },
  };
}

// deleteChain records the (table, column, value) it was asked to erase so tests
// can assert the route never widens the scope beyond the caller's own id.
function adminClient({ failTables = [], rowsPerTable = 1 } = {}) {
  const calls = [];
  return {
    calls,
    database: {
      from: vi.fn((table) => ({
        delete: vi.fn(() => ({
          eq: vi.fn((column, value) => {
            calls.push({ table, column, value });
            return {
              select: vi.fn(async () =>
                failTables.includes(table)
                  ? { data: null, error: { message: `${table} delete failed` } }
                  : { data: Array.from({ length: rowsPerTable }, (_, i) => ({ id: `${table}-${i}` })), error: null },
              ),
            };
          }),
        })),
      })),
    },
  };
}

function jsonRequest(body) {
  return new Request("https://app.example/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body,
  });
}

let currentAdmin;

describe("DELETE /api/account erases tenant data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, BASE_ENV);
    getServerClient.mockResolvedValue(sessionClient());
    currentAdmin = adminClient();
    createAdminClient.mockReturnValue(currentAdmin);
  });

  async function loadRoute() {
    return import("../src/app/api/account/route.ts");
  }

  it("rejects a body with no confirmation token before touching the database", async () => {
    const { DELETE } = await loadRoute();

    const res = await DELETE(jsonRequest("{}"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining("DELETE_MY_ACCOUNT"), code: "invalid_body" },
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a wrong confirmation token", async () => {
    const { DELETE } = await loadRoute();

    const res = await DELETE(jsonRequest(JSON.stringify({ confirm: "yes" })));

    expect(res.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body with 400 rather than 500", async () => {
    const { DELETE } = await loadRoute();

    const res = await DELETE(jsonRequest("{not json"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: { message: "Invalid body", code: "invalid_body" },
    });
  });

  it("returns 401 when there is no authenticated user", async () => {
    getServerClient.mockResolvedValue(sessionClient({ user: null }));
    const { DELETE } = await loadRoute();

    const res = await DELETE(jsonRequest(JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" })));

    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns 503 auth_unavailable on a backend outage, never 401", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getServerClient.mockResolvedValue(sessionClient({ authError: { message: "backend down" } }));
      const { DELETE } = await loadRoute();

      const res = await DELETE(jsonRequest(JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" })));

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe("auth_unavailable");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("erases every tenant table scoped to the caller's own id", async () => {
    const { DELETE } = await loadRoute();

    const res = await DELETE(jsonRequest(JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" })));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Object.keys(body.deleted).sort()).toEqual([
      "api_keys",
      "profiles",
      "runs",
      "spans",
      "usage_events",
    ]);
    expect(body.auth_identity_retained).toBe(true);

    expect(currentAdmin.calls).toHaveLength(5);
    for (const call of currentAdmin.calls) {
      expect(call.value).toBe(USER_ID);
    }
    expect(currentAdmin.calls.find((c) => c.table === "profiles").column).toBe("id");
    for (const table of ["spans", "runs", "usage_events", "api_keys"]) {
      expect(currentAdmin.calls.find((c) => c.table === table).column).toBe("user_id");
    }
  });

  it("reports partial erasure instead of claiming success when a table fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      createAdminClient.mockReturnValue(adminClient({ failTables: ["runs"] }));
      const { DELETE } = await loadRoute();

      const res = await DELETE(jsonRequest(JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" })));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.failed).toEqual(["runs"]);
      expect(body.deleted.spans).toBe(1);
      expect(body.deleted.runs).toBeUndefined();
      expect(body.error.message).toMatch(/did not complete/);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("does not leak raw database errors to the client", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      createAdminClient.mockReturnValue(adminClient({ failTables: ["spans"] }));
      const { DELETE } = await loadRoute();

      const res = await DELETE(jsonRequest(JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" })));
      const raw = await res.text();

      expect(raw).not.toContain("spans delete failed");
    } finally {
      errSpy.mockRestore();
    }
  });
});
