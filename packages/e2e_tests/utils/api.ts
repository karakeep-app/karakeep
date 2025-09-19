import { getTrpcClient } from "./trpc";

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

export async function createTestUser() {
  const trpc = getTrpcClient();

  const random = Math.random().toString(36).substring(7);
  const email = `testuser+${random}@example.com`;

  await trpc.users.create.mutate({
    name: "Test User",
    email,
    password: "test1234",
    confirmPassword: "test1234",
  });

  const { key } = await trpc.apiKeys.exchange.mutate({
    email,
    password: "test1234",
    keyName: "test-key",
  });

  return key;
}
