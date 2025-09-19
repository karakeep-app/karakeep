import { GlobalSetupContext } from "vitest/node";

import { getTrpcClient } from "../utils/trpc";

export async function setup({ provide }: GlobalSetupContext) {
  const trpc = getTrpcClient();
  await trpc.users.create.mutate({
    name: "Test User",
    email: "admin@example.com",
    password: "test1234",
    confirmPassword: "test1234",
  });

  const { key } = await trpc.apiKeys.exchange.mutate({
    email: "admin@example.com",
    password: "test1234",
    keyName: "test-key",
  });
  provide("adminApiKey", key);
  return () => ({});
}

declare module "vitest" {
  export interface ProvidedContext {
    adminApiKey: string;
  }
}
