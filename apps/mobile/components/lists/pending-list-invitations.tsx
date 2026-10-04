import { ActivityIndicator, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";

interface Invitation {
  id: string;
  role: "viewer" | "editor";
  list: { name: string; owner: { name: string } | null };
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
        toast({ message: "Invitation accepted", showProgress: false });
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
        toast({ message: "Invitation declined", showProgress: false });
      },
    }),
  );
  const busy = accept.isPending || decline.isPending;
  return (
    <View className="gap-2 rounded-xl bg-card p-4">
      <Text className="font-semibold">{invitation.list.name}</Text>
      <Text variant="footnote" color="tertiary">
        {invitation.list.owner
          ? `Invited by ${invitation.list.owner.name}. `
          : ""}
        {invitation.role === "editor"
          ? "Can view, add, and remove bookmarks."
          : "Can view bookmarks."}
      </Text>
      <View className="flex-row items-center gap-3">
        <Button
          accessibilityLabel={`Accept invitation to ${invitation.list.name}`}
          disabled={busy}
          onPress={() => accept.mutate({ invitationId: invitation.id })}
        >
          <Text>Accept</Text>
        </Button>
        <Button
          accessibilityLabel={`Decline invitation to ${invitation.list.name}`}
          variant="plain"
          disabled={busy}
          onPress={() => decline.mutate({ invitationId: invitation.id })}
        >
          <Text>Decline</Text>
        </Button>
        {busy && <ActivityIndicator size="small" />}
      </View>
    </View>
  );
}

export function PendingListInvitations() {
  const api = useTRPC();
  const { data, error, refetch } = useQuery(
    api.lists.getPendingInvitations.queryOptions(),
  );
  if (error) {
    return (
      <Button variant="plain" onPress={() => void refetch()}>
        <Text>Retry loading invitations</Text>
      </Button>
    );
  }
  if (!data?.length) return null;
  return (
    <View className="mb-4 gap-2">
      <Text variant="footnote" color="tertiary" className="px-4 uppercase">
        Invitations
      </Text>
      {data.map((invitation) => (
        <InvitationRow key={invitation.id} invitation={invitation} />
      ))}
    </View>
  );
}
