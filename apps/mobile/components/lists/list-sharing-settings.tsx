import { Fragment, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  Switch,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { MenuView } from "@react-native-menu/menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Copy,
  Globe,
  Share2,
  Trash2,
  UserPlus,
} from "lucide-react-native";

import { useEditBookmarkList } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";

import { Button } from "@/components/ui/Button";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";

type Role = "viewer" | "editor";

function RolePicker({
  role,
  onChange,
  disabled,
  label = "Permission",
}: {
  role: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { colors } = useColorScheme();
  return (
    <MenuView
      title="Permission"
      actions={[
        {
          id: "viewer",
          title: "Can view",
          state: role === "viewer" ? "on" : "off",
          attributes: { disabled },
        },
        {
          id: "editor",
          title: "Can edit",
          state: role === "editor" ? "on" : "off",
          attributes: { disabled },
        },
      ]}
      onPressAction={({ nativeEvent }) => {
        if (
          !disabled &&
          (nativeEvent.event === "viewer" || nativeEvent.event === "editor")
        )
          onChange(nativeEvent.event);
      }}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${role === "viewer" ? "Can view" : "Can edit"}`}
        accessibilityState={{ disabled }}
        className="min-h-11 flex-row items-center gap-1.5"
      >
        <Text className="text-primary">
          {role === "viewer" ? "Can view" : "Can edit"}
        </Text>
        <ChevronDown size={16} color={colors.primary} />
      </View>
    </MenuView>
  );
}

function Person({
  name,
  email,
  subtitle,
  children,
}: {
  name: string;
  email?: string | null;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Text className="font-semibold text-primary">
          {(name || email || "?").slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1}>{name || email || "User"}</Text>
        {email ? (
          <Text variant="footnote" color="tertiary" numberOfLines={1}>
            {email}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="footnote" color="tertiary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function ListSharingSettings({ list }: { list: ZBookmarkList }) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { colors } = useColorScheme();
  const { settings } = useAppSettings();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const isOwner = list.userRole === "owner";
  const { data: config } = useQuery(api.config.clientConfig.queryOptions());
  const publicUrl = `${(config?.publicUrl || settings.address).replace(/\/$/, "")}/public/lists/${list.id}`;
  const collaboratorsQuery = useQuery(
    api.lists.getCollaborators.queryOptions({ listId: list.id }),
  );
  const collaborators = collaboratorsQuery.data;

  const onError = (error: { message: string }) =>
    toast({
      message: error.message,
      variant: "destructive",
      showProgress: false,
    });
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(
        api.lists.getCollaborators.queryFilter({ listId: list.id }),
      ),
      queryClient.invalidateQueries(
        api.lists.get.queryFilter({ listId: list.id }),
      ),
      queryClient.invalidateQueries(api.lists.list.pathFilter()),
      queryClient.invalidateQueries(api.lists.stats.pathFilter()),
      queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter()),
    ]);
  const editList = useEditBookmarkList({
    onError,
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        api.lists.get.queryFilter({ listId: list.id }),
      );
    },
  });
  const invite = useMutation(
    api.lists.addCollaborator.mutationOptions({
      onError,
      onSuccess: async () => {
        setEmail("");
        toast({ message: "Invitation sent", showProgress: false });
        await invalidate();
      },
    }),
  );
  const remove = useMutation(
    api.lists.removeCollaborator.mutationOptions({
      onError,
      onSuccess: invalidate,
    }),
  );
  const updateRole = useMutation(
    api.lists.updateCollaboratorRole.mutationOptions({
      onError,
      onSuccess: invalidate,
    }),
  );
  const revoke = useMutation(
    api.lists.revokeInvitation.mutationOptions({
      onError,
      onSuccess: invalidate,
    }),
  );
  const isUpdating =
    invite.isPending ||
    remove.isPending ||
    updateRole.isPending ||
    revoke.isPending;

  const sendInvitation = () => {
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({
        message: "Enter a valid email address",
        variant: "destructive",
        showProgress: false,
      });
      return;
    }
    invite.mutate({ listId: list.id, email: trimmedEmail, role });
  };

  const sharePublicLink = async (copy: boolean) => {
    try {
      if (copy) {
        await Clipboard.setStringAsync(publicUrl);
        toast({ message: "Public link copied", showProgress: false });
      } else {
        await Share.share(
          Platform.OS === "ios" ? { url: publicUrl } : { message: publicUrl },
        );
      }
    } catch {
      toast({
        message: "Failed to share link",
        variant: "destructive",
        showProgress: false,
      });
    }
  };

  return (
    <View className="gap-5">
      <Text variant="title3" className="px-1 font-semibold">
        {list.name}
      </Text>
      {isOwner && (
        <GroupedSection header="Public access">
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Globe size={22} color={colors.grey} />
            <View className="flex-1 gap-1">
              <Text>Public list</Text>
              <Text variant="footnote" color="tertiary">
                Anyone with the link can view the bookmarks in this list.
              </Text>
            </View>
            {editList.isPending ? <ActivityIndicator size="small" /> : null}
            <Switch
              accessibilityLabel="Public list"
              value={list.public}
              disabled={editList.isPending || !config || !!config.demoMode}
              onValueChange={(value) =>
                editList.mutate({ listId: list.id, public: value })
              }
            />
          </View>
          {list.public && (
            <>
              <RowSeparator />
              <View className="gap-2 px-4 py-3">
                <Text variant="footnote" color="tertiary" selectable>
                  {publicUrl}
                </Text>
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void sharePublicLink(true)}
                    className="min-h-11 flex-row items-center gap-2 pr-3 active:opacity-70"
                  >
                    <Copy size={18} color={colors.primary} />
                    <Text className="text-primary">Copy link</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void sharePublicLink(false)}
                    className="min-h-11 flex-row items-center gap-2 px-3 active:opacity-70"
                  >
                    <Share2 size={18} color={colors.primary} />
                    <Text className="text-primary">Share link</Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </GroupedSection>
      )}

      {isOwner && list.type === "manual" && (
        <GroupedSection header="Invite a collaborator">
          <View className="gap-3 p-4">
            <Input
              accessibilityLabel="Collaborator email"
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isUpdating}
              returnKeyType="send"
              onSubmitEditing={() => {
                if (!isUpdating) sendInvitation();
              }}
            />
            <View className="flex-row items-center justify-between">
              <Text>Permission</Text>
              <RolePicker
                role={role}
                onChange={setRole}
                disabled={isUpdating}
              />
            </View>
            <Text variant="footnote" color="tertiary">
              {role === "viewer"
                ? "Can view bookmarks in this list."
                : "Can view, add, and remove bookmarks in this list."}
            </Text>
            <Button
              onPress={sendInvitation}
              disabled={!email.trim() || isUpdating}
              size="lg"
            >
              {invite.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <UserPlus size={18} color="white" />
              )}
              <Text>
                {invite.isPending ? "Inviting..." : "Send invitation"}
              </Text>
            </Button>
          </View>
        </GroupedSection>
      )}
      {isOwner && list.type === "smart" && (
        <Text variant="footnote" color="tertiary" className="px-4">
          Only manual lists can have collaborators.
        </Text>
      )}

      <GroupedSection header="People with access">
        {collaboratorsQuery.isPending ? (
          <ActivityIndicator className="p-4" />
        ) : collaboratorsQuery.error ? (
          <View className="gap-3 p-4">
            <Text color="tertiary">Unable to load collaborators.</Text>
            <Button
              variant="plain"
              onPress={() => void collaboratorsQuery.refetch()}
            >
              <Text>Try again</Text>
            </Button>
          </View>
        ) : collaborators ? (
          <>
            {collaborators.owner && (
              <Person
                name={collaborators.owner.name}
                email={collaborators.owner.email}
              >
                <Text variant="footnote" color="tertiary">
                  Owner
                </Text>
              </Person>
            )}
            {collaborators.collaborators.map((person, index) => (
              <Fragment key={person.id}>
                {(index > 0 || !!collaborators.owner) && <RowSeparator />}
                <Person
                  name={person.user.name}
                  email={person.user.email}
                  subtitle={
                    person.status === "pending"
                      ? "Invitation pending"
                      : person.status === "declined"
                        ? "Invitation declined"
                        : undefined
                  }
                >
                  {isOwner && person.status === "accepted" ? (
                    <RolePicker
                      role={person.role}
                      disabled={isUpdating}
                      label={`Permission for ${person.user.name}`}
                      onChange={(role) =>
                        updateRole.mutate({
                          listId: list.id,
                          userId: person.userId,
                          role,
                        })
                      }
                    />
                  ) : (
                    <Text variant="footnote" color="tertiary">
                      {person.role === "viewer" ? "Can view" : "Can edit"}
                    </Text>
                  )}
                  {isOwner && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${person.status === "accepted" ? "Remove" : "Revoke invitation for"} ${person.user.name}`}
                      disabled={isUpdating}
                      className="min-h-11 min-w-11 items-center justify-center active:opacity-70"
                      onPress={() =>
                        Alert.alert(
                          person.status === "accepted"
                            ? "Remove collaborator?"
                            : "Revoke invitation?",
                          person.status === "accepted"
                            ? `${person.user.name} will lose access. Bookmarks they added will be removed from this list.`
                            : `Revoke the invitation for ${person.user.name}?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text:
                                person.status === "accepted"
                                  ? "Remove"
                                  : "Revoke",
                              style: "destructive",
                              onPress: () =>
                                person.status === "accepted"
                                  ? remove.mutate({
                                      listId: list.id,
                                      userId: person.userId,
                                    })
                                  : revoke.mutate({ invitationId: person.id }),
                            },
                          ],
                        )
                      }
                    >
                      <Trash2 size={18} color={colors.destructive} />
                    </Pressable>
                  )}
                </Person>
              </Fragment>
            ))}
            {collaborators.collaborators.length === 0 && (
              <>
                {collaborators.owner && <RowSeparator />}
                <Text variant="footnote" color="tertiary" className="px-4 py-3">
                  No collaborators yet.
                </Text>
              </>
            )}
            {isUpdating && !invite.isPending && (
              <ActivityIndicator className="pb-3" />
            )}
          </>
        ) : null}
      </GroupedSection>
    </View>
  );
}
