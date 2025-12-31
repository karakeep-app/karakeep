"use client";

import { ActionButton } from "@/components/ui/action-button";
import { ButtonWithTooltip } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import { Mail, MailX, UserPlus } from "lucide-react";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { AdminCard } from "./AdminCard";
import CreateInviteDialog from "./CreateInviteDialog";

export default function InvitesList() {
  const invalidateInvitesList = api.useUtils().invites.list.invalidate;
  const [invites] = api.invites.list.useSuspenseQuery();

  const { mutateAsync: revokeInvite, isPending: isRevokePending } =
    api.invites.revoke.useMutation({
      onSuccess: () => {
        toast({
          description: "Invite revoked successfully",
        });
        invalidateInvitesList();
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Failed to revoke invite: ${e.message}`,
        });
      },
    });

  const { mutateAsync: resendInvite, isPending: isResendPending } =
    api.invites.resend.useMutation({
      onSuccess: () => {
        toast({
          description: "Invite resent successfully",
        });
        invalidateInvitesList();
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Failed to resend invite: ${e.message}`,
        });
      },
    });

  const activeInvites = invites?.invites || [];

  const InviteTable = ({
    invites: inviteList,
    title,
  }: {
    invites: NonNullable<typeof invites>["invites"];
    title: string;
  }) => (
    <div className="mb-6">
      {inviteList.length === 0 ? (
        <p className="text-sm text-gray-500">
          No {title.toLowerCase()} invites
        </p>
      ) : (
        <Table>
          <TableHeader className="bg-gray-200">
            <TableHead>Email</TableHead>
            <TableHead>Invited By</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableHeader>
          <TableBody>
            {inviteList.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="py-2">{invite.email}</TableCell>
                <TableCell className="py-2">{invite.invitedBy.name}</TableCell>
                <TableCell className="py-2">
                  {formatDistanceToNow(new Date(invite.createdAt), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell className="flex gap-1 py-2">
                  {
                    <>
                      <ButtonWithTooltip
                        tooltip="Resend Invite"
                        variant="outline"
                        size="sm"
                        onClick={() => resendInvite({ inviteId: invite.id })}
                        disabled={isResendPending}
                      >
                        <Mail size={14} />
                      </ButtonWithTooltip>
                      <ActionConfirmingDialog
                        title="Revoke Invite"
                        description={`Are you sure you want to revoke the invite for ${invite.email}? This action cannot be undone.`}
                        actionButton={(setDialogOpen) => (
                          <ActionButton
                            variant="destructive"
                            loading={isRevokePending}
                            onClick={async () => {
                              await revokeInvite({ inviteId: invite.id });
                              setDialogOpen(false);
                            }}
                          >
                            Revoke
                          </ActionButton>
                        )}
                      >
                        <ButtonWithTooltip
                          tooltip="Revoke Invite"
                          variant="outline"
                          size="sm"
                        >
                          <MailX size={14} color="red" />
                        </ButtonWithTooltip>
                      </ActionConfirmingDialog>
                    </>
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );

  return (
    <AdminCard>
      <div className="flex flex-col gap-4">
        <div className="mb-2 flex items-center justify-between text-xl font-medium">
          <span>User Invitations ({activeInvites.length})</span>
          <CreateInviteDialog>
            <ButtonWithTooltip tooltip="Send Invite" variant="outline">
              <UserPlus size={16} />
            </ButtonWithTooltip>
          </CreateInviteDialog>
        </div>

        <InviteTable invites={activeInvites} title="Invites" />
      </div>
    </AdminCard>
  );
}
