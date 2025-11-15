import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Admin API", () => {
  const port = inject("karakeepPort");
  const adminApiKey = inject("adminApiKey");

  if (!port || !adminApiKey) {
    throw new Error("Missing required environment variables");
  }

  let adminClient: ReturnType<typeof createKarakeepClient>;
  let regularClient: ReturnType<typeof createKarakeepClient>;
  let regularUserApiKey: string;

  beforeEach(async () => {
    // Admin client for admin operations
    adminClient = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${adminApiKey}`,
      },
    });

    // Regular user client to test non-admin access
    regularUserApiKey = await createTestUser();
    regularClient = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${regularUserApiKey}`,
      },
    });
  });

  describe("User Management", () => {
    it("should get user stats as admin", async () => {
      const { data, error } = await adminClient.GET("/admin/users/stats");

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(typeof data).toBe("object");
    });

    it("should not allow regular users to get user stats", async () => {
      const { error, response } = await regularClient.GET("/admin/users/stats");

      expect(error).toBeDefined();
      expect(response.status).toBe(403);
    });

    it("should create a new user as admin", async () => {
      const random = Math.random().toString(36).substring(7);
      const { data, error } = await adminClient.POST("/admin/users", {
        body: {
          name: "New Test User",
          email: `newuser+${random}@example.com`,
          password: "password123",
          confirmPassword: "password123",
          role: "user",
        },
      });

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.name).toBe("New Test User");
      expect(data?.email).toBe(`newuser+${random}@example.com`);
      expect(data?.role).toBe("user");
    });

    it("should create an admin user as admin", async () => {
      const random = Math.random().toString(36).substring(7);
      const { data, error } = await adminClient.POST("/admin/users", {
        body: {
          name: "New Admin User",
          email: `newadmin+${random}@example.com`,
          password: "password123",
          confirmPassword: "password123",
          role: "admin",
        },
      });

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.name).toBe("New Admin User");
      expect(data?.role).toBe("admin");
    });

    it("should not allow regular users to create users", async () => {
      const random = Math.random().toString(36).substring(7);
      const { error, response } = await regularClient.POST("/admin/users", {
        body: {
          name: "Unauthorized User",
          email: `unauthorized+${random}@example.com`,
          password: "password123",
          confirmPassword: "password123",
          role: "user",
        },
      });

      expect(error).toBeDefined();
      expect(response.status).toBe(403);
    });

    it("should update a user's role as admin", async () => {
      // First create a user
      const random = Math.random().toString(36).substring(7);
      const { data: newUser } = await adminClient.POST("/admin/users", {
        body: {
          name: "User to Update",
          email: `updateme+${random}@example.com`,
          password: "password123",
          confirmPassword: "password123",
          role: "user",
        },
      });

      expect(newUser).toBeDefined();

      // Update the user's role
      const { data, error } = await adminClient.PUT("/admin/users/{userId}", {
        params: {
          path: {
            userId: newUser!.id,
          },
        },
        body: {
          role: "admin",
        },
      });

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.success).toBe(true);
    });

    it("should update a user's bookmark quota as admin", async () => {
      // First create a user
      const random = Math.random().toString(36).substring(7);
      const { data: newUser } = await adminClient.POST("/admin/users", {
        body: {
          name: "User for Quota Update",
          email: `quotauser+${random}@example.com`,
          password: "password123",
          confirmPassword: "password123",
          role: "user",
        },
      });

      expect(newUser).toBeDefined();

      // Update the user's bookmark quota
      const { data, error } = await adminClient.PUT("/admin/users/{userId}", {
        params: {
          path: {
            userId: newUser!.id,
          },
        },
        body: {
          bookmarkQuota: 5000,
        },
      });

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.success).toBe(true);
    });

    it("should reset a user's password as admin", async () => {
      // First create a user
      const random = Math.random().toString(36).substring(7);
      const { data: newUser } = await adminClient.POST("/admin/users", {
        body: {
          name: "User for Password Reset",
          email: `passreset+${random}@example.com`,
          password: "password123",
          confirmPassword: "password123",
          role: "user",
        },
      });

      expect(newUser).toBeDefined();

      // Reset the user's password
      const { data, error } = await adminClient.PUT(
        "/admin/users/{userId}/password",
        {
          params: {
            path: {
              userId: newUser!.id,
            },
          },
          body: {
            newPassword: "newpassword123",
            newPasswordConfirm: "newpassword123",
          },
        },
      );

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.success).toBe(true);
    });
  });

  describe("Invite Management", () => {
    it("should create an invite as admin", async () => {
      const random = Math.random().toString(36).substring(7);
      const { data, error } = await adminClient.POST("/admin/invites", {
        body: {
          email: `invited+${random}@example.com`,
        },
      });

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.email).toBe(`invited+${random}@example.com`);
      expect(data?.id).toBeDefined();
    });

    it("should not allow regular users to create invites", async () => {
      const random = Math.random().toString(36).substring(7);
      const { error, response } = await regularClient.POST("/admin/invites", {
        body: {
          email: `unauthorized+${random}@example.com`,
        },
      });

      expect(error).toBeDefined();
      expect(response.status).toBe(403);
    });

    it("should list all invites as admin", async () => {
      // Create a few invites first
      const random = Math.random().toString(36).substring(7);
      await adminClient.POST("/admin/invites", {
        body: { email: `invite1+${random}@example.com` },
      });
      await adminClient.POST("/admin/invites", {
        body: { email: `invite2+${random}@example.com` },
      });

      const { data, error } = await adminClient.GET("/admin/invites");

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.invites).toBeDefined();
      expect(Array.isArray(data?.invites)).toBe(true);
      expect(data!.invites!.length).toBeGreaterThanOrEqual(2);
    });

    it("should not allow regular users to list invites", async () => {
      const { error, response } = await regularClient.GET("/admin/invites");

      expect(error).toBeDefined();
      expect(response.status).toBe(403);
    });

    it("should revoke an invite as admin", async () => {
      // First create an invite
      const random = Math.random().toString(36).substring(7);
      const { data: invite } = await adminClient.POST("/admin/invites", {
        body: {
          email: `torevoke+${random}@example.com`,
        },
      });

      expect(invite).toBeDefined();

      // Revoke the invite
      const { data, error } = await adminClient.DELETE(
        "/admin/invites/{inviteId}",
        {
          params: {
            path: {
              inviteId: invite!.id,
            },
          },
        },
      );

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.success).toBe(true);
    });

    it("should resend an invite as admin", async () => {
      // First create an invite
      const random = Math.random().toString(36).substring(7);
      const { data: invite } = await adminClient.POST("/admin/invites", {
        body: {
          email: `toresend+${random}@example.com`,
        },
      });

      expect(invite).toBeDefined();

      // Resend the invite
      const { data, error } = await adminClient.POST(
        "/admin/invites/{inviteId}/resend",
        {
          params: {
            path: {
              inviteId: invite!.id,
            },
          },
        },
      );

      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data?.id).toBe(invite!.id);
      expect(data?.email).toBe(`toresend+${random}@example.com`);
    });

    it("should not allow creating duplicate invites", async () => {
      const random = Math.random().toString(36).substring(7);
      const email = `duplicate+${random}@example.com`;

      // Create first invite
      const { data: firstInvite, error: firstError } = await adminClient.POST(
        "/admin/invites",
        {
          body: { email },
        },
      );

      expect(firstError).toBeUndefined();
      expect(firstInvite).toBeDefined();

      // Try to create duplicate invite
      const { error: secondError, response } = await adminClient.POST(
        "/admin/invites",
        {
          body: { email },
        },
      );

      expect(secondError).toBeDefined();
      expect(response.status).toBe(400);
    });

    it("should not allow inviting existing users", async () => {
      // Create a user first
      const random = Math.random().toString(36).substring(7);
      const email = `existinguser+${random}@example.com`;
      await adminClient.POST("/admin/users", {
        body: {
          name: "Existing User",
          email,
          password: "password123",
          confirmPassword: "password123",
          role: "user",
        },
      });

      // Try to create invite for existing user
      const { error, response } = await adminClient.POST("/admin/invites", {
        body: { email },
      });

      expect(error).toBeDefined();
      expect(response.status).toBe(400);
    });
  });
});
