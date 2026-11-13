"use client";

import { ActionButton } from "@/components/ui/action-button";
import { ButtonWithTooltip } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Mail, MailX, UserPlus } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { AdminCard } from "./AdminCard";
import CreateInviteDialog from "./CreateInviteDialog";

export default function InvitesList() {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { data: invites } = useSuspenseQuery(api.invites.list.queryOptions());

  const { mutateAsync: revokeInvite, isPending: isRevokePending } = useMutation(
    api.invites.revoke.mutationOptions({
      onSuccess: () => {
        toast({
          description: "Invite revoked successfully",
        });
        queryClient.invalidateQueries(api.invites.list.pathFilter());
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Failed to revoke invite: ${e.message}`,
        });
      },
    }),
  );

  const { mutateAsync: resendInvite, isPending: isResendPending } = useMutation(
    api.invites.resend.mutationOptions({
      onSuccess: () => {
        toast({
          description: "Invite resent successfully",
        });
        queryClient.invalidateQueries(api.invites.list.pathFilter());
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Failed to resend invite: ${e.message}`,
        });
      },
    }),
  );

  const activeInvites = invites?.invites || [];

  const renderInviteTable = (
    inviteList: NonNullable<typeof invites>["invites"],
  ) => (
    <div className="mb-6">
      {inviteList.length === 0 ? (
        <p className="text-sm text-gray-500">{t("admin.invites.no_invites")}</p>
      ) : (
        <Table>
          <TableHeader className="bg-gray-200 dark:bg-muted">
            <TableHead>Email</TableHead>
            <TableHead>{t("admin.invites.invited_by")}</TableHead>
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
                        tooltip={t("admin.invites.resend_invite")}
                        variant="outline"
                        size="sm"
                        onClick={() => resendInvite({ inviteId: invite.id })}
                        disabled={isResendPending}
                      >
                        <Mail className="size-3.5" size={14} />
                      </ButtonWithTooltip>
                      <ActionConfirmingDialog
                        title={t("admin.invites.revoke_invite")}
                        description={t("admin.invites.revoke_confirmation", {
                          email: invite.email,
                        })}
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
                          tooltip={t("admin.invites.revoke_invite")}
                          variant="outline"
                          size="sm"
                        >
                          <MailX className="size-3.5" size={14} color="red" />
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
          <span>
            {t("admin.invites.title", { count: activeInvites.length })}
          </span>
          <CreateInviteDialog>
            <ButtonWithTooltip
              tooltip={t("admin.invites.send_invite")}
              variant="outline"
            >
              <UserPlus size={16} />
            </ButtonWithTooltip>
          </CreateInviteDialog>
        </div>

        {renderInviteTable(activeInvites)}
      </div>
    </AdminCard>
  );
}
