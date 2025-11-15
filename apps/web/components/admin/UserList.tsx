"use client";

import { ActionButton } from "@/components/ui/action-button";
import { ButtonWithTooltip } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { Check, KeyRound, Pencil, Trash, UserPlus, X } from "lucide-react";
import { useSession } from "next-auth/react";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import AddUserDialog from "./AddUserDialog";
import { AdminCard } from "./AdminCard";
import InvitesList from "./InvitesList";
import ResetPasswordDialog from "./ResetPasswordDialog";
import UpdateUserDialog from "./UpdateUserDialog";

function toHumanReadableSize(size: number) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (size === 0) return "0 Bytes";
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

export default function UsersSection() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const invalidateUserList = api.useUtils().users.list.invalidate;
  const { data: users } = api.users.list.useQuery();
  const { data: userStats } = api.admin.userStats.useQuery();
  const { mutateAsync: deleteUser, isPending: isDeletionPending } =
    api.users.delete.useMutation({
      onSuccess: () => {
        toast({
          description: "User deleted",
        });
        invalidateUserList();
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Something went wrong: ${e.message}`,
        });
      },
    });

  if (!users || !userStats) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminCard>
        <div className="flex flex-col gap-4">
          <div className="mb-2 flex items-center justify-between text-xl font-medium">
            <span>{t("admin.users_list.users_list")}</span>
            <AddUserDialog>
              <ButtonWithTooltip tooltip="Create User" variant="outline">
                <UserPlus size={16} />
              </ButtonWithTooltip>
            </AddUserDialog>
          </div>

          <Table>
            <TableHeader className="bg-gray-200">
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.email")}</TableHead>
                <TableHead>{t("admin.users_list.num_bookmarks")}</TableHead>
                <TableHead>{t("admin.users_list.asset_sizes")}</TableHead>
                <TableHead>{t("common.role")}</TableHead>
                <TableHead>{t("admin.users_list.local_user")}</TableHead>
                <TableHead>{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="py-1">{u.name}</TableCell>
                  <TableCell className="py-1">{u.email}</TableCell>
                  <TableCell className="py-1">
                    {userStats[u.id].numBookmarks} /{" "}
                    {u.bookmarkQuota ?? t("admin.users_list.unlimited")}
                  </TableCell>
                  <TableCell className="py-1">
                    {toHumanReadableSize(userStats[u.id].assetSizes)} /{" "}
                    {u.storageQuota
                      ? toHumanReadableSize(u.storageQuota)
                      : t("admin.users_list.unlimited")}
                  </TableCell>
                  <TableCell className="py-1">
                    {u.role && t(`common.roles.${u.role}`)}
                  </TableCell>
                  <TableCell className="py-1">
                    {u.localUser ? <Check /> : <X />}
                  </TableCell>
                  <TableCell className="flex gap-1 py-1">
                    <ActionConfirmingDialog
                      title={t("admin.users_list.delete_user")}
                      description={t(
                        "admin.users_list.delete_user_confirm_description",
                        {
                          name: u.name ?? "this user",
                        },
                      )}
                      actionButton={(setDialogOpen) => (
                        <ActionButton
                          variant="destructive"
                          loading={isDeletionPending}
                          onClick={async () => {
                            await deleteUser({ userId: u.id });
                            setDialogOpen(false);
                          }}
                        >
                          Delete
                        </ActionButton>
                      )}
                    >
                      <ButtonWithTooltip
                        tooltip={t("admin.users_list.delete_user")}
                        variant="outline"
                        disabled={session!.user.id == u.id}
                      >
                        <Trash size={16} color="red" />
                      </ButtonWithTooltip>
                    </ActionConfirmingDialog>
                    <ResetPasswordDialog userId={u.id}>
                      <ButtonWithTooltip
                        tooltip={t("admin.users_list.reset_password")}
                        variant="outline"
                        disabled={session!.user.id == u.id || !u.localUser}
                      >
                        <KeyRound size={16} color="red" />
                      </ButtonWithTooltip>
                    </ResetPasswordDialog>
                    <UpdateUserDialog
                      userId={u.id}
                      currentRole={u.role!}
                      currentQuota={u.bookmarkQuota}
                      currentStorageQuota={u.storageQuota}
                    >
                      <ButtonWithTooltip
                        tooltip="Edit User"
                        variant="outline"
                        disabled={session!.user.id == u.id}
                      >
                        <Pencil size={16} color="red" />
                      </ButtonWithTooltip>
                    </UpdateUserDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AdminCard>

      <AdminCard>
        <InvitesList />
      </AdminCard>
    </div>
  );
}
