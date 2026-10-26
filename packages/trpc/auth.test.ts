import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { accounts, users } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";

import type { CustomTestContext } from "./testUtils";
import {
  CREDENTIAL_PROVIDER_ID,
  hashPassword,
  hasPassword,
  setUserPassword,
  validatePassword,
  verifyPasswordHash,
  verifyUserPassword,
} from "./auth";
import { createTestUser, defaultBeforeEach } from "./testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(false));

async function legacySaltedHash(password: string, salt: string) {
  return `bcrypt-salted:${salt}:${await bcrypt.hash(password + salt, 10)}`;
}

async function getCredentialAccounts(
  db: CustomTestContext["db"],
  userId: string,
) {
  return await db.select().from(accounts).where(eq(accounts.userId, userId));
}

describe("verifyPasswordHash", () => {
  test("accepts the right password for a plain bcrypt hash", async () => {
    const hash = await hashPassword("pass1234");
    expect(hash).not.toContain("pass1234");
    expect(hash.startsWith("bcrypt-salted:")).toBe(false);
    expect(await verifyPasswordHash(hash, "pass1234")).toBe(true);
  });

  test("rejects the wrong password for a plain bcrypt hash", async () => {
    const hash = await hashPassword("pass1234");
    expect(await verifyPasswordHash(hash, "wrongpass")).toBe(false);
  });

  test("accepts the right password for a legacy salted hash", async () => {
    const hash = await legacySaltedHash("pass1234", "some-salt");
    expect(await verifyPasswordHash(hash, "pass1234")).toBe(true);
  });

  test("rejects the wrong password for a legacy salted hash", async () => {
    const hash = await legacySaltedHash("pass1234", "some-salt");
    expect(await verifyPasswordHash(hash, "wrongpass")).toBe(false);
    // The salt itself must be applied, not just accepted as a prefix
    expect(await verifyPasswordHash(hash, "pass1234some-salt")).toBe(false);
  });

  test("rejects a legacy hash whose salt doesn't match", async () => {
    const hash = await bcrypt.hash("pass1234" + "real-salt", 10);
    expect(
      await verifyPasswordHash(`bcrypt-salted:other-salt:${hash}`, "pass1234"),
    ).toBe(false);
  });

  test("rejects a malformed legacy hash without a separator", async () => {
    const hash = await bcrypt.hash("pass1234", 10);
    // bcrypt hashes contain no `:`, so there's no salt/hash separator
    expect(hash).not.toContain(":");
    expect(await verifyPasswordHash(`bcrypt-salted:${hash}`, "pass1234")).toBe(
      false,
    );
    expect(await verifyPasswordHash("bcrypt-salted:", "pass1234")).toBe(false);
  });
});

describe("setUserPassword", () => {
  test<CustomTestContext>("creates a credential account", async ({ db }) => {
    const user = await createTestUser(db, {
      name: "Test User",
      email: "setpassword@test.com",
    });
    expect(await getCredentialAccounts(db, user.id)).toHaveLength(0);

    await setUserPassword(db, user.id, "pass1234");

    const userAccounts = await getCredentialAccounts(db, user.id);
    expect(userAccounts).toHaveLength(1);
    expect(userAccounts[0].providerId).toBe(CREDENTIAL_PROVIDER_ID);
    expect(userAccounts[0].accountId).toBe(user.id);
    expect(userAccounts[0].password).not.toBe("pass1234");
    expect(await verifyUserPassword(db, user.id, "pass1234")).toBe(true);
  });

  test<CustomTestContext>("overwrites an existing password", async ({ db }) => {
    const user = await createTestUser(db, {
      name: "Test User",
      email: "overwrite@test.com",
      password: "oldpass123",
    });

    await setUserPassword(db, user.id, "newpass123");

    expect(await getCredentialAccounts(db, user.id)).toHaveLength(1);
    expect(await verifyUserPassword(db, user.id, "newpass123")).toBe(true);
    expect(await verifyUserPassword(db, user.id, "oldpass123")).toBe(false);
  });

  test<CustomTestContext>("replaces a legacy salted password with a plain bcrypt one", async ({
    db,
  }) => {
    const user = await createTestUser(db, {
      name: "Legacy User",
      email: "legacy-overwrite@test.com",
    });
    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER_ID,
      password: await legacySaltedHash("oldpass123", "salt"),
    });
    expect(await verifyUserPassword(db, user.id, "oldpass123")).toBe(true);

    await setUserPassword(db, user.id, "newpass123");

    const userAccounts = await getCredentialAccounts(db, user.id);
    expect(userAccounts).toHaveLength(1);
    expect(userAccounts[0].password?.startsWith("bcrypt-salted:")).toBe(false);
    expect(await verifyUserPassword(db, user.id, "newpass123")).toBe(true);
    expect(await verifyUserPassword(db, user.id, "oldpass123")).toBe(false);
  });

  test<CustomTestContext>("only touches the given user's account", async ({
    db,
  }) => {
    const user1 = await createTestUser(db, {
      name: "User 1",
      email: "user1@test.com",
      password: "user1pass",
    });
    const user2 = await createTestUser(db, {
      name: "User 2",
      email: "user2@test.com",
      password: "user2pass",
    });

    await setUserPassword(db, user1.id, "newpass123");

    expect(await verifyUserPassword(db, user2.id, "user2pass")).toBe(true);
    expect(await verifyUserPassword(db, user2.id, "newpass123")).toBe(false);
  });
});

describe("hasPassword", () => {
  test<CustomTestContext>("is true for users with a password", async ({
    db,
  }) => {
    const user = await createTestUser(db, {
      name: "Test User",
      email: "haspassword@test.com",
      password: "pass1234",
    });
    expect(await hasPassword(db, user.id)).toBe(true);
  });

  test<CustomTestContext>("is false for users without a credential account", async ({
    db,
  }) => {
    const user = await createTestUser(db, {
      name: "OAuth User",
      email: "oauth@test.com",
    });
    await db.insert(accounts).values({
      userId: user.id,
      providerId: "custom",
      accountId: "oauth-account-id",
    });
    expect(await hasPassword(db, user.id)).toBe(false);
  });

  test<CustomTestContext>("is false for a credential account without a password", async ({
    db,
  }) => {
    const user = await createTestUser(db, {
      name: "Test User",
      email: "nullpassword@test.com",
    });
    await db.insert(accounts).values({
      userId: user.id,
      providerId: CREDENTIAL_PROVIDER_ID,
      accountId: user.id,
      password: null,
    });
    expect(await hasPassword(db, user.id)).toBe(false);
  });
});

describe("validatePassword", () => {
  test<CustomTestContext>("returns the user for the right password", async ({
    db,
  }) => {
    const user = await createTestUser(db, {
      name: "Test User",
      email: "validate@test.com",
      password: "pass1234",
    });

    const validated = await validatePassword(
      "validate@test.com",
      "pass1234",
      db,
    );
    expect(validated.id).toBe(user.id);
  });

  test<CustomTestContext>("matches emails case-insensitively", async ({
    db,
  }) => {
    const user = await createTestUser(db, {
      name: "Test User",
      email: "Mixed.Case@Test.com",
      password: "pass1234",
    });

    const validated = await validatePassword(
      "MIXED.case@test.COM",
      "pass1234",
      db,
    );
    expect(validated.id).toBe(user.id);
  });

  test<CustomTestContext>("accepts legacy salted passwords", async ({ db }) => {
    const user = await createTestUser(db, {
      name: "Legacy User",
      email: "legacy@test.com",
    });
    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER_ID,
      password: await legacySaltedHash("pass1234", "legacy-salt"),
    });

    const validated = await validatePassword("legacy@test.com", "pass1234", db);
    expect(validated.id).toBe(user.id);
    await expect(() =>
      validatePassword("legacy@test.com", "wrongpass", db),
    ).rejects.toThrow(/Wrong password/);
  });

  test<CustomTestContext>("rejects the wrong password", async ({ db }) => {
    await createTestUser(db, {
      name: "Test User",
      email: "wrongpass@test.com",
      password: "pass1234",
    });

    await expect(() =>
      validatePassword("wrongpass@test.com", "wrongpass", db),
    ).rejects.toThrow(/Wrong password/);
  });

  test<CustomTestContext>("rejects unknown users", async ({ db }) => {
    await expect(() =>
      validatePassword("nobody@test.com", "pass1234", db),
    ).rejects.toThrow(/User not found/);
  });

  test<CustomTestContext>("rejects users without a credential account", async ({
    db,
  }) => {
    const [user] = await db
      .insert(users)
      .values({ name: "OAuth User", email: "oauth@test.com" })
      .returning();
    await db.insert(accounts).values({
      userId: user.id,
      providerId: "custom",
      accountId: "oauth-account-id",
    });

    await expect(() =>
      validatePassword("oauth@test.com", "pass1234", db),
    ).rejects.toThrow(/Wrong password/);
  });

  test<CustomTestContext>("rejects everything when password auth is disabled", async ({
    db,
  }) => {
    await createTestUser(db, {
      name: "Test User",
      email: "disabled@test.com",
      password: "pass1234",
    });

    const originalValue = serverConfig.auth.disablePasswordAuth;
    serverConfig.auth.disablePasswordAuth = true;
    try {
      await expect(() =>
        validatePassword("disabled@test.com", "pass1234", db),
      ).rejects.toThrow(/Password authentication is currently disabled/);
    } finally {
      serverConfig.auth.disablePasswordAuth = originalValue;
    }
  });
});
