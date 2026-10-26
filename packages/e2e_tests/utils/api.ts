import { getTrpcClient } from "./trpc";
import type { ZApiKeyScope } from "@karakeep/shared/types/apiKeys";

export function getAuthHeader(apiKey: string) {
  return {
    "Content-Type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

export async function uploadTestAsset(
  apiKey: string,
  port: number,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`http://localhost:${port}/api/v1/assets`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload asset: ${response.statusText}`);
  }

  return response.json() as Promise<{
    assetId: string;
    contentType: string;
    fileName: string;
  }>;
}

// Signs up through better-auth's endpoint, the same way the web app does.
export async function signUpUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const baseUrl = `http://localhost:${process.env.KARAKEEP_PORT}`;
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Node's fetch sends Sec-Fetch-* headers but no Origin, which
      // better-auth's CSRF protection rejects. Browsers always send it.
      Origin: baseUrl,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to sign up ${input.email}: ${response.status} ${await response.text()}`,
    );
  }
}

export async function createTestUser(scopes?: ZApiKeyScope[]) {
  const trpc = getTrpcClient();

  const random = Math.random().toString(36).substring(7);
  const email = `testuser+${random}@example.com`;

  await signUpUser({
    name: "Test User",
    email,
    password: "test1234",
  });

  const { key } = await trpc.apiKeys.exchange.mutate({
    email,
    password: "test1234",
    keyName: "test-key",
    scopes,
  });

  if (
    !scopes ||
    scopes.includes("fullaccess") ||
    scopes.includes("users:readwrite")
  ) {
    const authedTrpc = getTrpcClient(key);
    await authedTrpc.users.updateSettings.mutate({
      autoTaggingEnabled: false,
      autoSummarizationEnabled: false,
    });
  }

  return key;
}
