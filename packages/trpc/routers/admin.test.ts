import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { users } from "@karakeep/db/schema";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getApiCaller } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(false));

describe("Admin Router - User Management", () => {
  test<CustomTestContext>("admin can create user", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    const newUser = await adminCaller.admin.createUser({
      name: "New User",
      email: "newuser@test.com",
      password: "userpass123",
      confirmPassword: "userpass123",
      role: "user",
    });

    expect(newUser.name).toBe("New User");
    expect(newUser.email).toBe("newuser@test.com");
    expect(newUser.role).toBe("user");
    expect(newUser.id).toBeDefined();
  });

  test<CustomTestContext>("admin can create admin user", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    const newAdmin = await adminCaller.admin.createUser({
      name: "New Admin",
      email: "newadmin@test.com",
      password: "adminpass123",
      confirmPassword: "adminpass123",
      role: "admin",
    });

    expect(newAdmin.name).toBe("New Admin");
    expect(newAdmin.email).toBe("newadmin@test.com");
    expect(newAdmin.role).toBe("admin");
  });

  test<CustomTestContext>("non-admin cannot create user", async ({
    db,
    unauthedAPICaller,
  }) => {
    await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user = await unauthedAPICaller.users.create({
      name: "Regular User",
      email: "user@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const userCaller = getApiCaller(db, user.id, user.email);

    await expect(() =>
      userCaller.admin.createUser({
        name: "New User",
        email: "newuser@test.com",
        password: "userpass123",
        confirmPassword: "userpass123",
        role: "user",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  test<CustomTestContext>("admin can update multiple user fields", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user = await unauthedAPICaller.users.create({
      name: "Regular User",
      email: "user@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    await adminCaller.admin.updateUser({
      userId: user.id,
      role: "admin",
      bookmarkQuota: 2000,
      storageQuota: 10000000000,
      browserCrawlingEnabled: true,
    });

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    expect(updatedUser?.role).toBe("admin");
    expect(updatedUser?.bookmarkQuota).toBe(2000);
    expect(updatedUser?.storageQuota).toBe(10000000000);
    expect(updatedUser?.browserCrawlingEnabled).toBe(true);
  });

  test<CustomTestContext>("admin cannot update themselves", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    await expect(() =>
      adminCaller.admin.updateUser({
        userId: admin.id,
        role: "user",
      }),
    ).rejects.toThrow(/Cannot update own user/);
  });

  test<CustomTestContext>("updateUser fails with no fields", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user = await unauthedAPICaller.users.create({
      name: "Regular User",
      email: "user@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    await expect(() =>
      adminCaller.admin.updateUser({
        userId: user.id,
      }),
    ).rejects.toThrow(/No fields to update/);
  });

  test<CustomTestContext>("updateUser fails with non-existent user", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    await expect(() =>
      adminCaller.admin.updateUser({
        userId: "non-existent-id",
        role: "admin",
      }),
    ).rejects.toThrow(/User not found/);
  });

  test<CustomTestContext>("non-admin cannot update user", async ({
    db,
    unauthedAPICaller,
  }) => {
    await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user1 = await unauthedAPICaller.users.create({
      name: "User 1",
      email: "user1@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user2 = await unauthedAPICaller.users.create({
      name: "User 2",
      email: "user2@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const userCaller = getApiCaller(db, user1.id, user1.email);

    await expect(() =>
      userCaller.admin.updateUser({
        userId: user2.id,
        role: "admin",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  test<CustomTestContext>("admin can reset user password", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user = await unauthedAPICaller.users.create({
      name: "Regular User",
      email: "user@test.com",
      password: "oldpass123",
      confirmPassword: "oldpass123",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    await adminCaller.admin.resetPassword({
      userId: user.id,
      newPassword: "newpass456",
      newPasswordConfirm: "newpass456",
    });

    await unauthedAPICaller.apiKeys.exchange({
      keyName: "Admin API Key",
      email: "user@test.com",
      password: "newpass456",
    });
  });

  test<CustomTestContext>("admin cannot reset own password", async ({
    db,
    unauthedAPICaller,
  }) => {
    const admin = await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const adminCaller = getApiCaller(db, admin.id, admin.email, "admin");

    await expect(() =>
      adminCaller.admin.resetPassword({
        userId: admin.id,
        newPassword: "newpass456",
        newPasswordConfirm: "newpass456",
      }),
    ).rejects.toThrow(/Cannot reset own password/);
  });

  test<CustomTestContext>("non-admin cannot reset password", async ({
    db,
    unauthedAPICaller,
  }) => {
    await unauthedAPICaller.users.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user1 = await unauthedAPICaller.users.create({
      name: "User 1",
      email: "user1@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user2 = await unauthedAPICaller.users.create({
      name: "User 2",
      email: "user2@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const userCaller = getApiCaller(db, user1.id, user1.email);

    await expect(() =>
      userCaller.admin.resetPassword({
        userId: user2.id,
        newPassword: "newpass456",
        newPasswordConfirm: "newpass456",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
