import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadServerConfig() {
  vi.resetModules();
  return (await import("./config")).default;
}

describe("serverConfig auth oauth", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("reads the configured OIDC ID token signing algorithm", async () => {
    process.env.OAUTH_ID_TOKEN_SIGNED_RESPONSE_ALG = "ES384";

    const config = await loadServerConfig();

    expect(config.auth.oauth).toHaveProperty(
      "idTokenSignedResponseAlg",
      "ES384",
    );
  });

  it("accepts ES256 for providers that use P-256 ID token signatures", async () => {
    process.env.OAUTH_ID_TOKEN_SIGNED_RESPONSE_ALG = "ES256";

    const config = await loadServerConfig();

    expect(config.auth.oauth.idTokenSignedResponseAlg).toBe("ES256");
  });

  it("accepts EdDSA for providers that use Ed25519 ID token signatures", async () => {
    process.env.OAUTH_ID_TOKEN_SIGNED_RESPONSE_ALG = "EdDSA";

    const config = await loadServerConfig();

    expect(config.auth.oauth.idTokenSignedResponseAlg).toBe("EdDSA");
  });
});
