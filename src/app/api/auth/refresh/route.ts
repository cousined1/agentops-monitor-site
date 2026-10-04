import { createRefreshAuthRouter } from "@insforge/sdk/ssr";

export const runtime = "nodejs";

export const { POST } = createRefreshAuthRouter();
