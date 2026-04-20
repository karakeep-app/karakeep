import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { listCollaborators, listInvitations } from "@karakeep/db/schema";

import type { AuthedContext } from "..";

type Role = "viewer" | "editor";
type InvitationStatus = "pending" | "declined";

interface InvitationData {
  id: string;
  listId: string;
  userId: string;
  role: Role;
  status: InvitationStatus;
  invitedAt: Date;
  invitedEmail: string | null;
  invitedBy: string | null;
  listOwnerUserId: string;
}

export class ListInvitation {
  protected constructor(
    protected ctx: AuthedContext,
    protected invitation: InvitationData,
  ) {}

  get id() {
    return this.invitation.id;
  }

  /**
   * Load an invitation by ID
   * Can be accessed by:
   * - The invited user (userId matches)
   * - The list owner (via list ownership check)
   */
  static async fromId(
    ctx: AuthedContext,
    invitationId: string,
  ): Promise<ListInvitation> {
    const invitation = await ctx.db.query.listInvitations.findFirst({
      where: eq(listInvitations.id, invitationId),
      with: {
        list: {
          columns: {
            userId: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invitation not found",
      });
    }

    // Check if user has access to this invitation
    const isInvitedUser = invitation.userId === ctx.user.id;
    const isListOwner = invitation.list.userId === ctx.user.id;

    if (!isInvitedUser && !isListOwner) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invitation not found",
      });
    }

    return new ListInvitation(ctx, {
      id: invitation.id,
      listId: invitation.listId,
      userId: invitation.userId,
      role: invitation.role,
      status: invitation.status,
      invitedAt: invitation.invitedAt,
      invitedEmail: invitation.invitedEmail,
      invitedBy: invitation.invitedBy,
      listOwnerUserId: invitation.list.userId,
    });
  }

  /**
   * Ensure the current user is the invited user
   */
  ensureIsInvitedUser() {
    if (this.invitation.userId !== this.ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the invited user can perform this action",
      });
    }
  }

  /**
   * Ensure the current user is the list owner
   */
  ensureIsListOwner() {
    if (this.invitation.listOwnerUserId !== this.ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the list owner can perform this action",
      });
    }
  }

  /**
   * Accept the invitation
   */
  async accept(): Promise<void> {
    this.ensureIsInvitedUser();

    if (this.invitation.status !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only pending invitations can be accepted",
      });
    }

    await this.ctx.db.transaction(async (tx) => {
      await tx
        .delete(listInvitations)
        .where(eq(listInvitations.id, this.invitation.id));

      await tx
        .insert(listCollaborators)
        .values({
          listId: this.invitation.listId,
          userId: this.invitation.userId,
          role: this.invitation.role,
          addedBy: this.invitation.invitedBy,
        })
        .onConflictDoNothing();
    });
  }

  /**
   * Decline the invitation
   */
  async decline(): Promise<void> {
    this.ensureIsInvitedUser();

    if (this.invitation.status !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only pending invitations can be declined",
      });
    }

    await this.ctx.db
      .update(listInvitations)
      .set({
        status: "declined",
      })
      .where(eq(listInvitations.id, this.invitation.id));
  }

  /**
   * Revoke the invitation (owner only)
   */
  async revoke(): Promise<void> {
    this.ensureIsListOwner();

    await this.ctx.db
      .delete(listInvitations)
      .where(eq(listInvitations.id, this.invitation.id));
  }

  /**
   * @returns the invitation ID
   */
  static async inviteByEmail(
    ctx: AuthedContext,
    params: {
      email: string;
      role: Role;
      listId: string;
      listName: string;
      listType: "manual" | "smart";
      listOwnerId: string;
      inviterUserId: string;
      inviterName: string | null;
    },
  ): Promise<string> {
    const {
      email,
      role,
      listId,
      listName,
      listType,
      listOwnerId,
      inviterUserId,
      inviterName,
    } = params;

    const user = await ctx.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No user found with that email address",
      });
    }

    if (user.id === listOwnerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot add the list owner as a collaborator",
      });
    }

    if (listType !== "manual") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only manual lists can have collaborators",
      });
    }

    const existingCollaborator = await ctx.db.query.listCollaborators.findFirst(
      {
        where: and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, user.id),
        ),
      },
    );

    if (existingCollaborator) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is already a collaborator on this list",
      });
    }

    const existingInvitation = await ctx.db.query.listInvitations.findFirst({
      where: and(
        eq(listInvitations.listId, listId),
        eq(listInvitations.userId, user.id),
      ),
    });

    if (existingInvitation) {
      if (existingInvitation.status === "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User already has a pending invitation for this list",
        });
      } else if (existingInvitation.status === "declined") {
        await ctx.db
          .update(listInvitations)
          .set({
            status: "pending",
            role,
            invitedAt: new Date(),
            invitedEmail: email,
            invitedBy: inviterUserId,
          })
          .where(eq(listInvitations.id, existingInvitation.id));

        await this.sendInvitationEmail({
          email,
          inviterName,
          listName,
          listId,
        });
        return existingInvitation.id;
      }
    }

    const res = await ctx.db
      .insert(listInvitations)
      .values({
        listId,
        userId: user.id,
        role,
        status: "pending",
        invitedEmail: email,
        invitedBy: inviterUserId,
      })
      .returning();

    await this.sendInvitationEmail({
      email,
      inviterName,
      listName,
      listId,
    });
    return res[0].id;
  }

  static async pendingForUser(ctx: AuthedContext) {
    const invitations = await ctx.db.query.listInvitations.findMany({
      where: and(
        eq(listInvitations.userId, ctx.user.id),
        eq(listInvitations.status, "pending"),
      ),
      with: {
        list: {
          columns: {
            id: true,
            name: true,
            icon: true,
            description: true,
            rssToken: false,
          },
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      listId: inv.listId,
      role: inv.role,
      invitedAt: inv.invitedAt,
      list: {
        id: inv.list.id,
        name: inv.list.name,
        icon: inv.list.icon,
        description: inv.list.description,
        owner: inv.list.user
          ? {
              id: inv.list.user.id,
              name: inv.list.user.name,
              email: inv.list.user.email,
            }
          : null,
      },
    }));
  }

  static async invitationsForList(
    ctx: AuthedContext,
    params: { listId: string },
  ) {
    const invitations = await ctx.db.query.listInvitations.findMany({
      where: eq(listInvitations.listId, params.listId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      listId: invitation.listId,
      userId: invitation.userId,
      role: invitation.role,
      status: invitation.status,
      invitedAt: invitation.invitedAt,
      addedAt: invitation.invitedAt,
      user: {
        id: invitation.user.id,
        // Don't show the actual user's name for any invitation (pending or declined)
        // This protects user privacy until they accept
        name: "Pending User",
        email: invitation.user.email || "",
        image: null,
      },
    }));
  }

  static async sendInvitationEmail(params: {
    email: string;
    inviterName: string | null;
    listName: string;
    listId: string;
  }) {
    try {
      const { sendListInvitationEmail } = await import("../email");
      await sendListInvitationEmail(
        params.email,
        params.inviterName || "A user",
        params.listName,
        params.listId,
      );
    } catch (error) {
      // Log the error but don't fail the invitation
      console.error("Failed to send list invitation email:", error);
    }
  }
}
