import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/app/api/api-keys/route.ts: CRUD error
// paths, body parsing branches, and the insert-failure boundary. Only
// external seams are mocked (InsForge clients, next/cache revalidatePath);
// the real route handlers run throughout.
const { getServerClient, createAdminClient, revalidatePath } = vi.hoisted(() => ({
  getServerClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/insforge", () => ({ getServerClient }));
vi.mock("@insforge/sdk", () => ({ createAdminClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

function sessionClient({ updateError = null, deleteError = null, updateData = [{ id: "key-1" }], deleteData = [{ id: "key-1" }] } = {}) {
  return {
    auth: {
      getCurrentUser: vi.fn(async () => ({
        data: { user: { id: "user-1", email: "team@example.com" } },
        error: null,
      })),
    },
    database: {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: updateData, error: updateError })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: deleteData, error: deleteError })),
            })),
          })),
        })),
      })),
    },
  };
}

let currentAdmin;

function adminClient(insertError = null, insertData = [{ id: "key-new-uuid" }]) {
  const table = {
    insert: vi.fn(() => ({
      select: vi.fn(async () => ({ data: insertData, error: insertError })),
    })),
  };
  return { database: { from: vi.fn(() => table) } };
}

function jsonRequest(method, body, contentType = "application/json") {
  return new Request("https://app.example/api/api-keys", {
    method,
    headers: { "content-type": contentType },
    body,
  });
}

describe("api-keys route CRUD coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, BASE_ENV);
    getServerClient.mockResolvedValue(sessionClient());
    currentAdmin = adminClient();
    createAdminClient.mockReturnValue(currentAdmin);
  });

  function insertFn() {
    return currentAdmin.database.from("api_keys").insert;
  }

  it("POST creates a key from a JSON name and returns the raw key once", async () => {
    const { POST } = await import("../src/app/api/api-keys/route.ts");

    const response = await POST(jsonRequest("POST", JSON.stringify({ name: "ci" })));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.key).toMatch(/^aom_/);
    expect(body.id).toBe("key-new-uuid");
    expect(createAdminClient).toHaveBeenCalledWith({
      baseUrl: BASE_ENV.NEXT_PUBLIC_INSFORGE_URL,
      apiKey: BASE_ENV.INSFORGE_API_KEY,
    });
    const insert = insertFn();
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: "user-1", name: "ci" }),
    ]);
  });

  it("POST selects the generated id back so the key is revocable via the API", async () => {
    const { POST } = await import("../src/app/api/api-keys/route.ts");

    await POST(jsonRequest("POST", JSON.stringify({ name: "ci" })));

    const table = currentAdmin.database.from("api_keys");
    const insertCall = table.insert.mock.results[0].value;
    expect(insertCall.select).toHaveBeenCalledWith("id");
  });

  it("POST returns 500 and withholds the key when the insert yields no id", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      createAdminClient.mockReturnValue(adminClient(null, []));
      const { POST } = await import("../src/app/api/api-keys/route.ts");

      const response = await POST(jsonRequest("POST", JSON.stringify({ name: "ci" })));

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.key).toBeUndefined();
      await expect(Promise.resolve(body)).resolves.toEqual({
        error: { message: "Could not create the API key. Please try again.", code: "write_failed" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("POST defaults the key name when JSON carries no name", async () => {
    const { POST } = await import("../src/app/api/api-keys/route.ts");

    const response = await POST(jsonRequest("POST", "{}"));

    expect(response.status).toBe(200);
    expect(insertFn()).toHaveBeenCalledWith([
      expect.objectContaining({ name: "default" }),
    ]);
  });

  it("POST rejects malformed JSON with 400 Invalid JSON body", async () => {
    const { POST } = await import("../src/app/api/api-keys/route.ts");

    const response = await POST(jsonRequest("POST", "{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Invalid JSON body.", code: "invalid_json" },
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("POST reads the name from a urlencoded form body", async () => {
    const { POST } = await import("../src/app/api/api-keys/route.ts");

    const response = await POST(
      jsonRequest("POST", "name=webhook", "application/x-www-form-urlencoded"),
    );

    expect(response.status).toBe(200);
    expect(insertFn()).toHaveBeenCalledWith([
      expect.objectContaining({ name: "webhook" }),
    ]);
  });

  it("POST rejects an unparseable form body with 400 Invalid form body", async () => {
    const { POST } = await import("../src/app/api/api-keys/route.ts");

    const response = await POST(jsonRequest("POST", "plain text", "text/plain"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Invalid form body.", code: "invalid_body" },
    });
  });

  it("POST maps an insert failure to a sanitized 500", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      createAdminClient.mockReturnValue(adminClient({ message: "duplicate key value" }));
      const { POST } = await import("../src/app/api/api-keys/route.ts");

      const response = await POST(jsonRequest("POST", JSON.stringify({ name: "ci" })));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Could not create the API key. Please try again.", code: "write_failed" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("PATCH deactivates a key scoped to the current user", async () => {
    const { PATCH } = await import("../src/app/api/api-keys/route.ts");

    const response = await PATCH(
      jsonRequest("PATCH", JSON.stringify({ id: "key-1", is_active: false })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("PATCH rejects a body without is_active with 400", async () => {
    const { PATCH } = await import("../src/app/api/api-keys/route.ts");

    const response = await PATCH(jsonRequest("PATCH", JSON.stringify({ id: "key-1" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Invalid body", code: "invalid_body" },
    });
  });

  it("PATCH rejects malformed JSON with 400", async () => {
    const { PATCH } = await import("../src/app/api/api-keys/route.ts");

    const response = await PATCH(jsonRequest("PATCH", "{oops"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Invalid body", code: "invalid_body" },
    });
  });

  it("PATCH maps an update failure to 500", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getServerClient.mockResolvedValue(sessionClient({ updateError: { message: "db down" } }));
      const { PATCH } = await import("../src/app/api/api-keys/route.ts");

      const response = await PATCH(
        jsonRequest("PATCH", JSON.stringify({ id: "key-1", is_active: true })),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Could not update the API key.", code: "write_failed" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("DELETE removes a key scoped to the current user", async () => {
    const { DELETE } = await import("../src/app/api/api-keys/route.ts");

    const response = await DELETE(jsonRequest("DELETE", JSON.stringify({ id: "key-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("DELETE rejects a body without id with 400 Missing id", async () => {
    const { DELETE } = await import("../src/app/api/api-keys/route.ts");

    const response = await DELETE(jsonRequest("DELETE", "{}"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Missing id", code: "invalid_body" },
    });
  });

  it("DELETE rejects malformed JSON with 400", async () => {
    const { DELETE } = await import("../src/app/api/api-keys/route.ts");

    const response = await DELETE(jsonRequest("DELETE", "{oops"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Invalid body", code: "invalid_body" },
    });
  });

  it("DELETE maps a delete failure to 500", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getServerClient.mockResolvedValue(sessionClient({ deleteError: { message: "db down" } }));
      const { DELETE } = await import("../src/app/api/api-keys/route.ts");

      const response = await DELETE(jsonRequest("DELETE", JSON.stringify({ id: "key-1" })));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Could not delete the API key.", code: "write_failed" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("PATCH returns 404 when the key does not belong to the current user", async () => {
    getServerClient.mockResolvedValue(sessionClient({ updateData: [] }));
    const { PATCH } = await import("../src/app/api/api-keys/route.ts");

    const response = await PATCH(
      jsonRequest("PATCH", JSON.stringify({ id: "missing-key", is_active: false })),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { message: "API key not found.", code: "not_found" },
    });
  });

  it("DELETE returns 404 when the key does not belong to the current user", async () => {
    getServerClient.mockResolvedValue(sessionClient({ deleteData: [] }));
    const { DELETE } = await import("../src/app/api/api-keys/route.ts");

    const response = await DELETE(jsonRequest("DELETE", JSON.stringify({ id: "missing-key" })));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { message: "API key not found.", code: "not_found" },
    });
  });
});
