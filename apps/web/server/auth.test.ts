import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({}),
  getServerSession: () => null,
}));

vi.mock("@karakeep/db", () => ({
  db: {},
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: () => ({}),
}));

vi.mock("@karakeep/shared-server", () => ({
  logEvent: () => undefined,
}));

vi.mock("@karakeep/trpc/auth", () => ({
  validatePassword: () => null,
}));

vi.mock("@karakeep/trpc/models/users", () => ({
  User: {
    createRaw: () => ({ id: "user-id" }),
  },
}));

vi.mock("@karakeep/db/schema", () => ({
  accounts: {},
  sessions: {},
  users: {},
  verificationTokens: {},
}));

const oauthConfig = vi.hoisted(() => ({
  allowDangerousEmailAccountLinking: false,
  clientId: "client-id",
  clientSecret: "client-secret",
  idTokenSignedResponseAlg: "ES384" as string | undefined,
  name: "Custom Provider",
  scope: "openid email profile",
  timeout: 3500,
  wellKnownUrl: "https://issuer.example/.well-known/openid-configuration",
}));

vi.mock("@karakeep/shared/config", () => ({
  default: {
    auth: {
      disableSignups: false,
      emailVerificationRequired: false,
      oauth: oauthConfig,
    },
  },
}));

describe("authOptions", () => {
  async function loadCustomProvider() {
    vi.resetModules();
    const { authOptions } = await import("./auth");
    return authOptions.providers.find((provider) => provider.id === "custom");
  }

  it("passes the configured ID token signing algorithm to the custom OIDC provider", async () => {
    oauthConfig.idTokenSignedResponseAlg = "ES384";

    const customProvider = await loadCustomProvider();

    expect(customProvider).toMatchObject({
      client: {
        id_token_signed_response_alg: "ES384",
      },
    });
  });

  it("does not override the provider's discovered signing algorithms by default", async () => {
    oauthConfig.idTokenSignedResponseAlg = undefined;

    const customProvider = await loadCustomProvider();

    expect(customProvider).not.toHaveProperty("client");
  });
});
