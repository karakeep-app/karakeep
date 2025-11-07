import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { apiKeys } from "@karakeep/db/schema";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getApiCaller } from "../testUtils";

vi.mock("@karakeep/shared/config", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/config");
  return {
    ...mod,
    default: {
      ...mod.default,
      auth: {
        ...mod.default.auth,
        disablePasswordAuth: false,
      },
    },
  };
});

beforeEach<CustomTestContext>(defaultBeforeEach(false));

describe("API Keys Routes", () => {
  describe("create", () => {
    test<CustomTestContext>("creates API key successfully", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;
      const result = await api.create({ name: "Test Key" });

      expect(result.name).toBe("Test Key");
      expect(result.id).toBeDefined();
      expect(result.key).toMatch(/^ak2_[a-f0-9]{20}_[a-f0-9]{32}$/);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    test<CustomTestContext>("requires authentication", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.apiKeys.create({ name: "Test Key" }),
      ).rejects.toThrow(/UNAUTHORIZED/);
    });
  });

  describe("list", () => {
    test<CustomTestContext>("lists user's API keys", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;

      await api.create({ name: "Key 1" });
      await api.create({ name: "Key 2" });

      const result = await api.list();

      expect(result.keys).toHaveLength(2);
      expect(result.keys[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        createdAt: expect.any(Date),
        keyId: expect.any(String),
      });
      expect(result.keys[0]).not.toHaveProperty("key");
    });

    test<CustomTestContext>("returns empty list for new user", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;
      const result = await api.list();

      expect(result.keys).toHaveLength(0);
    });

    test<CustomTestContext>("privacy isolation between users", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user1 = await unauthedAPICaller.users.create({
        name: "User 1",
        email: "user1@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const user2 = await unauthedAPICaller.users.create({
        name: "User 2",
        email: "user2@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api1 = getApiCaller(db, user1.id, user1.email).apiKeys;
      const api2 = getApiCaller(db, user2.id, user2.email).apiKeys;

      await api1.create({ name: "User 1 Key" });
      await api2.create({ name: "User 2 Key" });

      const result1 = await api1.list();
      const result2 = await api2.list();

      expect(result1.keys).toHaveLength(1);
      expect(result1.keys[0].name).toBe("User 1 Key");

      expect(result2.keys).toHaveLength(1);
      expect(result2.keys[0].name).toBe("User 2 Key");
    });

    test<CustomTestContext>("requires authentication", async ({
      unauthedAPICaller,
    }) => {
      await expect(() => unauthedAPICaller.apiKeys.list()).rejects.toThrow(
        /UNAUTHORIZED/,
      );
    });
  });
  describe("regenerate", () => {
    test<CustomTestContext>("revokes API key successfully", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;

      const firstKey = await api.create({ name: "Test Key" });
      const regeneratedKey = await api.regenerate({ id: firstKey.id });

      // Validate the new key
      const validationResult = await unauthedAPICaller.apiKeys.validate({
        apiKey: regeneratedKey.key,
      });
      expect(validationResult.success).toBe(true);

      // Validate the old key is revoked
      await expect(() =>
        unauthedAPICaller.apiKeys.validate({
          apiKey: firstKey.key,
        }),
      ).rejects.toThrow();
    });
  });

  describe("revoke", () => {
    test<CustomTestContext>("revokes API key successfully", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;

      const createdKey = await api.create({ name: "Test Key" });
      await api.revoke({ id: createdKey.id });

      const remainingKeys = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, createdKey.id));

      expect(remainingKeys).toHaveLength(0);
    });

    test<CustomTestContext>("cannot revoke another user's key", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user1 = await unauthedAPICaller.users.create({
        name: "User 1",
        email: "user1@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const user2 = await unauthedAPICaller.users.create({
        name: "User 2",
        email: "user2@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api1 = getApiCaller(db, user1.id, user1.email).apiKeys;
      const api2 = getApiCaller(db, user2.id, user2.email).apiKeys;

      const user1Key = await api1.create({ name: "User 1 Key" });

      await api2.revoke({ id: user1Key.id });

      const remainingKeys = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, user1Key.id));

      expect(remainingKeys).toHaveLength(1);
    });

    test<CustomTestContext>("silently handles non-existent key", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;

      await expect(
        api.revoke({ id: "non-existent-id" }),
      ).resolves.toBeUndefined();
    });

    test<CustomTestContext>("requires authentication", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.apiKeys.revoke({ id: "some-id" }),
      ).rejects.toThrow(/UNAUTHORIZED/);
    });
  });

  describe("validate", () => {
    test<CustomTestContext>("validates correct API key", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;
      const createdKey = await api.create({ name: "Test Key" });

      const result = await unauthedAPICaller.apiKeys.validate({
        apiKey: createdKey.key,
      });

      expect(result.success).toBe(true);
    });

    test<CustomTestContext>("rejects invalid API key", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.apiKeys.validate({
          apiKey: "invalid-key",
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("rejects malformed API key", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.apiKeys.validate({
          apiKey: "ak2_invalid",
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("rejects non-existent key ID", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.apiKeys.validate({
          apiKey: "ak2_1234567890abcdef1234_1234567890abcdef1234",
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("rejects key with wrong secret", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;
      const createdKey = await api.create({ name: "Test Key" });
      const keyParts = createdKey.key.split("_");
      const wrongKey = `${keyParts[0]}_${keyParts[1]}_wrongsecret123456`;

      await expect(() =>
        unauthedAPICaller.apiKeys.validate({
          apiKey: wrongKey,
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("validates revoked key fails", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;
      const createdKey = await api.create({ name: "Test Key" });
      await api.revoke({ id: createdKey.id });

      await expect(() =>
        unauthedAPICaller.apiKeys.validate({
          apiKey: createdKey.key,
        }),
      ).rejects.toThrow();
    });
  });

  describe("exchange", () => {
    test<CustomTestContext>("exchanges credentials for API key", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "exchange@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const result = await unauthedAPICaller.apiKeys.exchange({
        keyName: "Extension Key",
        email: "exchange@test.com",
        password: "password123",
      });

      expect(result.name).toBe("Extension Key");
      expect(result.key).toMatch(/^ak2_[a-f0-9]{20}_[a-f0-9]{32}$/);
      expect(result.createdAt).toBeInstanceOf(Date);

      const dbKeys = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.userId, user.id));

      expect(dbKeys).toHaveLength(1);
      expect(dbKeys[0].name).toBe("Extension Key");
    });

    test<CustomTestContext>("rejects wrong password", async ({
      unauthedAPICaller,
    }) => {
      await unauthedAPICaller.users.create({
        name: "Test User",
        email: "wrongpass@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      await expect(() =>
        unauthedAPICaller.apiKeys.exchange({
          keyName: "Extension Key",
          email: "wrongpass@test.com",
          password: "wrongpassword",
        }),
      ).rejects.toThrow(/UNAUTHORIZED/);
    });

    test<CustomTestContext>("rejects non-existent user", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.apiKeys.exchange({
          keyName: "Extension Key",
          email: "nonexistent@test.com",
          password: "password123",
        }),
      ).rejects.toThrow(/UNAUTHORIZED/);
    });
  });

  describe("integration scenarios", () => {
    test<CustomTestContext>("full API key lifecycle", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "lifecycle@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;

      const createdKey = await api.create({ name: "Lifecycle Test" });

      const validationResult = await unauthedAPICaller.apiKeys.validate({
        apiKey: createdKey.key,
      });
      expect(validationResult.success).toBe(true);

      const listResult = await api.list();
      expect(listResult.keys).toHaveLength(1);
      expect(listResult.keys[0].name).toBe("Lifecycle Test");

      await api.revoke({ id: createdKey.id });

      await expect(() =>
        unauthedAPICaller.apiKeys.validate({
          apiKey: createdKey.key,
        }),
      ).rejects.toThrow();

      const finalListResult = await api.list();
      expect(finalListResult.keys).toHaveLength(0);
    });

    test<CustomTestContext>("multiple keys per user", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "multikey@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const api = getApiCaller(db, user.id, user.email).apiKeys;

      await api.create({ name: "Key 1" });
      const key2 = await api.create({ name: "Key 2" });
      await api.create({ name: "Key 3" });

      const listResult = await api.list();
      expect(listResult.keys).toHaveLength(3);

      const keyNames = listResult.keys.map((k) => k.name).sort();
      expect(keyNames).toEqual(["Key 1", "Key 2", "Key 3"]);

      await api.revoke({ id: key2.id });

      const updatedListResult = await api.list();
      expect(updatedListResult.keys).toHaveLength(2);

      const remainingNames = updatedListResult.keys.map((k) => k.name).sort();
      expect(remainingNames).toEqual(["Key 1", "Key 3"]);
    });

    test<CustomTestContext>("exchange creates usable key", async ({
      unauthedAPICaller,
    }) => {
      await unauthedAPICaller.users.create({
        name: "Exchange User",
        email: "exchangetest@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const exchangedKey = await unauthedAPICaller.apiKeys.exchange({
        keyName: "Exchange Test Key",
        email: "exchangetest@test.com",
        password: "password123",
      });

      const validationResult = await unauthedAPICaller.apiKeys.validate({
        apiKey: exchangedKey.key,
      });

      expect(validationResult.success).toBe(true);
    });
  });

  describe("backward compatibility", () => {
    test<CustomTestContext>("validates version 1 keys continues to work", async ({
      unauthedAPICaller,
      db,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "password123",
      });

      // Manually generated v1 key and its corresponding hash
      const key = "ak1_1316296acfe14b7961d5_aa88970c058be93e3c7a";
      await db
        .insert(apiKeys)
        .values({
          name: "Test Key",
          userId: user.id,
          keyId: "1316296acfe14b7961d5",
          keyHash:
            "$2a$10$pnJyG.0NPTHImX/nukeUteibD//ztBg4MTjWYRI9n3d54Z/TWvcNC",
        })
        .returning();

      const api = getApiCaller(db, user.id, user.email).apiKeys;
      const result = await api.validate({ apiKey: key });

      expect(result.success).toBe(true);
    });
  });
});
