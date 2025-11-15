import { GlobalSetupContext } from "vitest/node";

import { getTrpcClient } from "../utils/trpc";

export async function setup({ provide }: GlobalSetupContext) {
  const trpc = getTrpcClient();

  // Create an admin user for testing admin endpoints
  // The first user is automatically an admin
  await trpc.users.create.mutate({
    name: "Admin User",
    email: "admin@example.com",
    password: "admin1234",
    confirmPassword: "admin1234",
  });

  const { key: adminKey } = await trpc.apiKeys.exchange.mutate({
    email: "admin@example.com",
    password: "admin1234",
    keyName: "admin-test-key",
  });

  provide("adminApiKey", adminKey);
  return () => ({});
}

declare module "vitest" {
  export interface ProvidedContext {
    adminApiKey: string;
  }
}
