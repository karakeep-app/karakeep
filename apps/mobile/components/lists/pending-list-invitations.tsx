import { ActivityIndicator, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useSharedTranslation, useTranslation } from "@/lib/i18n/hooks";

interface Invitation {
  id: string;
  role: "viewer" | "editor";
  list: { name: string; owner: { name: string } | null };
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { t: tShared } = useSharedTranslation();
  const onError = (error: { message: string }) =>
    toast({
      message: error.message,
      variant: "destructive",
      showProgress: false,
    });
  const accept = useMutation(
    api.lists.acceptInvitation.mutationOptions({
      onError,
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(
            api.lists.getPendingInvitations.pathFilter(),
          ),
          queryClient.invalidateQueries(api.lists.list.pathFilter()),
          queryClient.invalidateQueries(api.lists.stats.pathFilter()),
        ]);
        toast({
          message: tShared("lists.invitations.accepted"),
          showProgress: false,
        });
      },
    }),
  );
  const decline = useMutation(
    api.lists.declineInvitation.mutationOptions({
      onError,
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          api.lists.getPendingInvitations.pathFilter(),
        );
        toast({
          message: tShared("lists.invitations.declined"),
          showProgress: false,
        });
      },
    }),
  );
  const busy = accept.isPending || decline.isPending;
  return (
    <View className="gap-2 rounded-xl bg-card p-4">
      <Text className="font-semibold">{invitation.list.name}</Text>
      <Text variant="footnote" color="tertiary">
        {invitation.list.owner
          ? t("list_sharing.invited_by", { name: invitation.list.owner.name })
          : ""}
        {invitation.role === "editor"
          ? t("list_sharing.role_editor_note")
          : t("list_sharing.role_viewer_note")}
      </Text>
      <View className="flex-row items-center gap-3">
        <Button
          accessibilityLabel={t("list_sharing.accept_invitation_label", {
            name: invitation.list.name,
          })}
          disabled={busy}
          onPress={() => accept.mutate({ invitationId: invitation.id })}
        >
          <Text>{tShared("lists.invitations.accept")}</Text>
        </Button>
        <Button
          accessibilityLabel={t("list_sharing.decline_invitation_label", {
            name: invitation.list.name,
          })}
          variant="plain"
          disabled={busy}
          onPress={() => decline.mutate({ invitationId: invitation.id })}
        >
          <Text>{tShared("lists.invitations.decline")}</Text>
        </Button>
        {busy && <ActivityIndicator size="small" />}
      </View>
    </View>
  );
}

export function PendingListInvitations() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data, error, refetch } = useQuery(
    api.lists.getPendingInvitations.queryOptions(),
  );
  if (error) {
    return (
      <Button variant="plain" onPress={() => void refetch()}>
        <Text>{t("list_sharing.retry_invitations")}</Text>
      </Button>
    );
  }
  if (!data?.length) return null;
  return (
    <View className="mb-4 gap-2">
      <Text variant="footnote" color="tertiary" className="px-4 uppercase">
        {t("list_sharing.invitations_header")}
      </Text>
      {data.map((invitation) => (
        <InvitationRow key={invitation.id} invitation={invitation} />
      ))}
    </View>
  );
}
