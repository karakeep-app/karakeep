import { TestProject } from "vitest/node";

import { signUpUser } from "../utils/api";
import { getTrpcClient } from "../utils/trpc";

export async function setup({ provide }: TestProject) {
  const trpc = getTrpcClient();
  await signUpUser({
    name: "Test User",
    email: "admin@example.com",
    password: "test1234",
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
