import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";

import { listCollaborators, listInvitations } from "@karakeep/db/schema";

import type { AuthedContext } from "..";

type Role = "viewer" | "editor";
type InvitationStatus = "pending" | "accepted" | "declined";

function sanitizeInvitation(
  invitation: {
    id: string;
    listId: string;
    userId: string;
    role: Role;
    status: InvitationStatus;
    invitedAt: Date;
    invitedEmail: string | null;
    user: {
      id: string;
      name: string | null;
      email: string | null;
    };
  },
  isOwner: boolean,
) {
  const isPending = invitation.status === "pending";

  return {
    id: invitation.id,
    listId: invitation.listId,
    userId: invitation.userId,
    role: invitation.role,
    status: invitation.status,
    invitedAt: invitation.invitedAt,
    addedAt: invitation.invitedAt,
    user: {
      id: invitation.user.id,
      name:
        isPending && !isOwner
          ? "Pending User"
          : invitation.user.name || "Pending User",
      email: isOwner
        ? invitation.user.email || ""
        : isPending
          ? invitation.invitedEmail || ""
          : invitation.user.email || "",
    },
  };
}

export class ListInvitation {
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
  ): Promise<void> {
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
      } else if (existingInvitation.status === "accepted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already a collaborator on this list",
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
        return;
      }
    }

    await ctx.db.insert(listInvitations).values({
      listId,
      userId: user.id,
      role,
      status: "pending",
      invitedEmail: email,
      invitedBy: inviterUserId,
    });

    await this.sendInvitationEmail({
      email,
      inviterName,
      listName,
      listId,
    });
  }

  static async accept(
    ctx: AuthedContext,
    params: { listId: string },
  ): Promise<void> {
    const invitation = await ctx.db.query.listInvitations.findFirst({
      where: and(
        eq(listInvitations.listId, params.listId),
        eq(listInvitations.userId, ctx.user.id),
        eq(listInvitations.status, "pending"),
      ),
    });

    if (!invitation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending invitation found for this list",
      });
    }

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(listInvitations)
        .set({
          status: "accepted",
        })
        .where(eq(listInvitations.id, invitation.id));

      await tx
        .insert(listCollaborators)
        .values({
          listId: invitation.listId,
          userId: invitation.userId,
          role: invitation.role,
          addedBy: invitation.invitedBy,
        })
        .onConflictDoNothing();
    });
  }

  static async decline(
    ctx: AuthedContext,
    params: { listId: string },
  ): Promise<void> {
    const result = await ctx.db
      .update(listInvitations)
      .set({
        status: "declined",
      })
      .where(
        and(
          eq(listInvitations.listId, params.listId),
          eq(listInvitations.userId, ctx.user.id),
          or(
            eq(listInvitations.status, "pending"),
            eq(listInvitations.status, "declined"),
          ),
        ),
      );

    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending invitation found for this list",
      });
    }
  }

  static async revoke(
    ctx: AuthedContext,
    params: { listId: string; userId: string },
  ): Promise<void> {
    const result = await ctx.db
      .delete(listInvitations)
      .where(
        and(
          eq(listInvitations.listId, params.listId),
          eq(listInvitations.userId, params.userId),
          eq(listInvitations.status, "pending"),
        ),
      );

    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending invitation found for this user",
      });
    }
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
    params: { listId: string; isOwner: boolean; includeAccepted?: boolean },
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

    return invitations
      .filter(
        (inv) => params.includeAccepted === true || inv.status !== "accepted",
      )
      .map((inv) =>
        sanitizeInvitation(
          {
            id: inv.id,
            listId: inv.listId,
            userId: inv.userId,
            role: inv.role,
            status: inv.status as InvitationStatus,
            invitedAt: inv.invitedAt,
            invitedEmail: inv.invitedEmail,
            user: inv.user,
          },
          params.isOwner,
        ),
      );
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
