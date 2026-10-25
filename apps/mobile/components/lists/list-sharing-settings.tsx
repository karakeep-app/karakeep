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
import {
  useCommonActions,
  useSharedTranslation,
  useTranslation,
} from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";

type Role = "viewer" | "editor";

function RolePicker({
  role,
  onChange,
  disabled,
  label,
}: {
  role: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const permissionLabel = label ?? t("list_sharing.permission");
  const canView = t("list_sharing.can_view");
  const canEdit = t("list_sharing.can_edit");
  return (
    <MenuView
      title={t("list_sharing.permission")}
      actions={[
        {
          id: "viewer",
          title: canView,
          state: role === "viewer" ? "on" : "off",
          attributes: { disabled },
        },
        {
          id: "editor",
          title: canEdit,
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
        accessibilityLabel={`${permissionLabel}: ${role === "viewer" ? canView : canEdit}`}
        accessibilityState={{ disabled }}
        className="min-h-11 flex-row items-center gap-1.5"
      >
        <Text className="text-primary">
          {role === "viewer" ? canView : canEdit}
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
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Text className="font-semibold text-primary">
          {(name || email || "?").slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1}>{name || email || t("list_sharing.user")}</Text>
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
  const { t } = useTranslation();
  const { t: tShared } = useSharedTranslation();
  const actions = useCommonActions();
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
        toast({
          message: t("list_sharing.invitation_sent"),
          showProgress: false,
        });
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
        message: t("list_sharing.invalid_email"),
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
        toast({
          message: t("list_sharing.public_link_copied"),
          showProgress: false,
        });
      } else {
        await Share.share(
          Platform.OS === "ios" ? { url: publicUrl } : { message: publicUrl },
        );
      }
    } catch {
      toast({
        message: t("list_sharing.share_link_failed"),
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
        <GroupedSection header={t("list_sharing.public_access")}>
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Globe size={22} color={colors.grey} />
            <View className="flex-1 gap-1">
              <Text>{t("list_sharing.public_list")}</Text>
              <Text variant="footnote" color="tertiary">
                {t("list_sharing.public_list_description")}
              </Text>
            </View>
            {editList.isPending ? <ActivityIndicator size="small" /> : null}
            <Switch
              accessibilityLabel={t("list_sharing.public_list")}
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
                    <Text className="text-primary">
                      {t("list_sharing.copy_link")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void sharePublicLink(false)}
                    className="min-h-11 flex-row items-center gap-2 px-3 active:opacity-70"
                  >
                    <Share2 size={18} color={colors.primary} />
                    <Text className="text-primary">
                      {t("list_sharing.share_link")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </GroupedSection>
      )}

      {isOwner && list.type === "manual" && (
        <GroupedSection header={t("list_sharing.invite_collaborator")}>
          <View className="gap-3 p-4">
            <Input
              accessibilityLabel={t("list_sharing.collaborator_email")}
              placeholder={t("list_sharing.email_placeholder")}
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
              <Text>{t("list_sharing.permission")}</Text>
              <RolePicker
                role={role}
                onChange={setRole}
                disabled={isUpdating}
              />
            </View>
            <Text variant="footnote" color="tertiary">
              {role === "viewer"
                ? t("list_sharing.viewer_description")
                : t("list_sharing.editor_description")}
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
                {invite.isPending
                  ? t("list_sharing.inviting")
                  : t("list_sharing.send_invitation")}
              </Text>
            </Button>
          </View>
        </GroupedSection>
      )}
      {isOwner && list.type === "smart" && (
        <Text variant="footnote" color="tertiary" className="px-4">
          {t("list_sharing.manual_only")}
        </Text>
      )}

      <GroupedSection header={t("list_sharing.people_with_access")}>
        {collaboratorsQuery.isPending ? (
          <ActivityIndicator className="p-4" />
        ) : collaboratorsQuery.error ? (
          <View className="gap-3 p-4">
            <Text color="tertiary">
              {t("list_sharing.collaborators_load_failed")}
            </Text>
            <Button
              variant="plain"
              onPress={() => void collaboratorsQuery.refetch()}
            >
              <Text>{t("list_sharing.try_again")}</Text>
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
                  {tShared("lists.collaborators.owner")}
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
                      ? t("list_sharing.invitation_pending")
                      : person.status === "declined"
                        ? t("list_sharing.invitation_declined")
                        : undefined
                  }
                >
                  {isOwner && person.status === "accepted" ? (
                    <RolePicker
                      role={person.role}
                      disabled={isUpdating}
                      label={t("list_sharing.permission_for", {
                        name: person.user.name,
                      })}
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
                      {person.role === "viewer"
                        ? t("list_sharing.can_view")
                        : t("list_sharing.can_edit")}
                    </Text>
                  )}
                  {isOwner && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        person.status === "accepted"
                          ? t("list_sharing.remove_collaborator_label", {
                              name: person.user.name,
                            })
                          : t("list_sharing.revoke_invitation_label", {
                              name: person.user.name,
                            })
                      }
                      disabled={isUpdating}
                      className="min-h-11 min-w-11 items-center justify-center active:opacity-70"
                      onPress={() =>
                        Alert.alert(
                          person.status === "accepted"
                            ? t("list_sharing.remove_collaborator_title")
                            : t("list_sharing.revoke_invitation_title"),
                          person.status === "accepted"
                            ? t("list_sharing.remove_collaborator_message", {
                                name: person.user.name,
                              })
                            : t("list_sharing.revoke_invitation_message", {
                                name: person.user.name,
                              }),
                          [
                            { text: actions.cancel, style: "cancel" },
                            {
                              text:
                                person.status === "accepted"
                                  ? actions.remove
                                  : tShared("lists.collaborators.revoke"),
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
                  {t("list_sharing.no_collaborators")}
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
