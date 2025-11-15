import { eq } from "drizzle-orm";
import { GlobalSetupContext } from "vitest/node";

import { db } from "@karakeep/db/drizzle";
import { users } from "@karakeep/db/schema";

import { getTrpcClient } from "../utils/trpc";

export async function setup({ provide }: GlobalSetupContext) {
  const trpc = getTrpcClient();

  // Create an admin user for testing admin endpoints
  await trpc.users.create.mutate({
    name: "Admin User",
    email: "admin@example.com",
    password: "admin1234",
    confirmPassword: "admin1234",
  });

  // Promote the user to admin role directly in the database
  await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.email, "admin@example.com"));

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
