import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Trash2, UserPlus, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import * as Haptics from "expo-haptics";
import { MenuView } from "@react-native-menu/menu";

import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Text } from "../ui/Text";
import { useToast } from "../ui/Toast";
import { Divider } from "../ui/Divider";

import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { api } from "@/lib/trpc";

interface ManageCollaboratorsModalProps {
  visible: boolean;
  list: ZBookmarkList;
  readOnly?: boolean;
  onClose: () => void;
}

export function ManageCollaboratorsModal({
  visible,
  list,
  readOnly = false,
  onClose,
}: ManageCollaboratorsModalProps) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === "dark" ? "#d1d5db" : "#374151";
  const { toast } = useToast();

  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState("");
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<
    "viewer" | "editor"
  >("viewer");

  const utils = api.useUtils();

  const invalidateListCaches = () =>
    Promise.all([
      utils.lists.getCollaborators.invalidate({ listId: list.id }),
      utils.lists.get.invalidate({ listId: list.id }),
      utils.lists.list.invalidate(),
      utils.bookmarks.getBookmarks.invalidate({ listId: list.id }),
    ]);

  // Fetch collaborators
  const { data: collaboratorsData, isLoading } =
    api.lists.getCollaborators.useQuery(
      { listId: list.id },
      { enabled: visible },
    );

  // Mutations
  const addCollaborator = api.lists.addCollaborator.useMutation({
    onSuccess: async () => {
      toast({
        message: "Invitation sent",
        showProgress: false,
      });
      setNewCollaboratorEmail("");
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        message: error.message || "Failed to add collaborator",
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const removeCollaborator = api.lists.removeCollaborator.useMutation({
    onSuccess: async () => {
      toast({
        message: "Collaborator removed",
        showProgress: false,
      });
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        message: error.message || "Failed to remove collaborator",
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const updateCollaboratorRole = api.lists.updateCollaboratorRole.useMutation({
    onSuccess: async () => {
      toast({
        message: "Role updated",
        showProgress: false,
      });
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        message: error.message || "Failed to update role",
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const revokeInvitation = api.lists.revokeInvitation.useMutation({
    onSuccess: async () => {
      toast({
        message: "Invitation revoked",
        showProgress: false,
      });
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        message: error.message || "Failed to revoke invitation",
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const handleAddCollaborator = () => {
    if (!newCollaboratorEmail.trim()) {
      toast({
        message: "Please enter an email address",
        variant: "destructive",
        showProgress: false,
      });
      return;
    }

    addCollaborator.mutate({
      listId: list.id,
      email: newCollaboratorEmail,
      role: newCollaboratorRole,
    });
  };

  const handleRemoveCollaborator = (userId: string, userName: string) => {
    Alert.alert(
      "Remove Collaborator",
      `Are you sure you want to remove ${userName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          onPress: () => {
            removeCollaborator.mutate({
              listId: list.id,
              userId,
            });
          },
          style: "destructive",
        },
      ],
    );
  };

  const handleRevokeInvitation = (invitationId: string, userName: string) => {
    Alert.alert(
      "Revoke Invitation",
      `Are you sure you want to revoke the invitation for ${userName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          onPress: () => {
            revokeInvitation.mutate({
              invitationId,
            });
          },
          style: "destructive",
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} />
        <View className="max-h-[85%] rounded-t-3xl bg-card">
          <KeyboardAwareScrollView
            contentContainerClassName="p-6"
            bottomOffset={20}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View className="mb-4 flex flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-lg font-semibold">
                  {readOnly ? "Collaborators" : "Manage Collaborators"}
                </Text>
                <Text className="text-xs text-gray-600 dark:text-gray-400">
                  {readOnly
                    ? "People with access to this list"
                    : "Add or remove people who can access this list"}
                </Text>
              </View>
              <Pressable onPress={onClose} className="p-2">
                <X size={24} color={iconColor} />
              </Pressable>
            </View>

            {/* Add Collaborator Section */}
            {!readOnly && (
              <View className="mb-6">
                <Text className="mb-2 text-sm font-semibold">
                  Add Collaborator
                </Text>
                <View className="gap-2">
                  <Input
                    placeholder="Email address"
                    value={newCollaboratorEmail}
                    onChangeText={setNewCollaboratorEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    inputClasses="bg-background"
                  />
                  <View className="flex flex-row gap-2">
                    <View className="flex-1">
                      <MenuView
                        actions={[
                          {
                            id: "viewer",
                            title: "Viewer",
                            state:
                              newCollaboratorRole === "viewer"
                                ? ("on" as const)
                                : undefined,
                          },
                          {
                            id: "editor",
                            title: "Editor",
                            state:
                              newCollaboratorRole === "editor"
                                ? ("on" as const)
                                : undefined,
                          },
                        ]}
                        onPressAction={({ nativeEvent }) => {
                          Haptics.selectionAsync();
                          setNewCollaboratorRole(
                            nativeEvent.event as "viewer" | "editor",
                          );
                        }}
                        shouldOpenOnLongPress={false}
                      >
                        <Pressable
                          onPress={() => Haptics.selectionAsync()}
                          className="flex flex-row items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
                        >
                          <Text className="text-sm capitalize">
                            {newCollaboratorRole}
                          </Text>
                        </Pressable>
                      </MenuView>
                    </View>
                    <Button
                      variant="primary"
                      onPress={handleAddCollaborator}
                      disabled={addCollaborator.isPending}
                      androidRootClassName="h-auto"
                    >
                      {addCollaborator.isPending ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <UserPlus size={16} color="white" />
                      )}
                      <Text className="text-white">Add</Text>
                    </Button>
                  </View>
                  <Text className="text-xs text-gray-600 dark:text-gray-400">
                    <Text className="font-semibold">Viewer:</Text> Can view
                    bookmarks in the list{"\n"}
                    <Text className="font-semibold">Editor:</Text> Can add and
                    remove bookmarks
                  </Text>
                </View>
              </View>
            )}

            <Divider orientation="horizontal" />

            {/* Collaborators List */}
            <View className="mt-6">
              <Text className="mb-3 text-sm font-semibold">
                {readOnly ? "Collaborators" : "Current Collaborators"}
              </Text>
              {isLoading ? (
                <View className="flex items-center justify-center py-8">
                  <ActivityIndicator size="large" />
                </View>
              ) : collaboratorsData ? (
                <View className="gap-2">
                  {/* Show owner first */}
                  {collaboratorsData.owner && (
                    <View className="flex flex-row items-center justify-between rounded-lg border border-border bg-background p-3">
                      <View className="flex-1">
                        <Text className="font-medium">
                          {collaboratorsData.owner.name}
                        </Text>
                        {collaboratorsData.owner.email && (
                          <Text className="text-xs text-gray-600 dark:text-gray-400">
                            {collaboratorsData.owner.email}
                          </Text>
                        )}
                      </View>
                      <Text className="text-sm capitalize text-gray-600 dark:text-gray-400">
                        Owner
                      </Text>
                    </View>
                  )}

                  {/* Show collaborators */}
                  {collaboratorsData.collaborators.length > 0 ? (
                    collaboratorsData.collaborators.map((collaborator) => (
                      <View
                        key={collaborator.id}
                        className="flex flex-row items-center justify-between rounded-lg border border-border bg-background p-3"
                      >
                        <View className="flex-1">
                          <View className="flex flex-row items-center gap-2">
                            <Text className="font-medium">
                              {collaborator.user.name}
                            </Text>
                            {collaborator.status === "pending" && (
                              <View className="rounded-full bg-yellow-100 px-2 py-0.5 dark:bg-yellow-900">
                                <Text className="text-xs text-yellow-800 dark:text-yellow-200">
                                  Pending
                                </Text>
                              </View>
                            )}
                            {collaborator.status === "declined" && (
                              <View className="rounded-full bg-red-100 px-2 py-0.5 dark:bg-red-900">
                                <Text className="text-xs text-red-800 dark:text-red-200">
                                  Declined
                                </Text>
                              </View>
                            )}
                          </View>
                          {collaborator.user.email && (
                            <Text className="text-xs text-gray-600 dark:text-gray-400">
                              {collaborator.user.email}
                            </Text>
                          )}
                        </View>
                        {readOnly ? (
                          <Text className="text-sm capitalize text-gray-600 dark:text-gray-400">
                            {collaborator.role}
                          </Text>
                        ) : collaborator.status !== "accepted" ? (
                          <View className="flex flex-row items-center gap-2">
                            <Text className="text-sm capitalize text-gray-600 dark:text-gray-400">
                              {collaborator.role}
                            </Text>
                            <Button
                              variant="secondary"
                              onPress={() =>
                                handleRevokeInvitation(
                                  collaborator.id,
                                  collaborator.user.name,
                                )
                              }
                              disabled={revokeInvitation.isPending}
                              androidRootClassName="h-auto px-2 py-1"
                            >
                              <Text className="text-xs">Revoke</Text>
                            </Button>
                          </View>
                        ) : (
                          <View className="flex flex-row items-center gap-2">
                            <MenuView
                              actions={[
                                {
                                  id: "viewer",
                                  title: "Viewer",
                                  state:
                                    collaborator.role === "viewer"
                                      ? ("on" as const)
                                      : undefined,
                                },
                                {
                                  id: "editor",
                                  title: "Editor",
                                  state:
                                    collaborator.role === "editor"
                                      ? ("on" as const)
                                      : undefined,
                                },
                              ]}
                              onPressAction={({ nativeEvent }) => {
                                Haptics.selectionAsync();
                                updateCollaboratorRole.mutate({
                                  listId: list.id,
                                  userId: collaborator.userId,
                                  role: nativeEvent.event as "viewer" | "editor",
                                });
                              }}
                              shouldOpenOnLongPress={false}
                            >
                              <Pressable
                                onPress={() => Haptics.selectionAsync()}
                                className="min-w-[80px] rounded border border-border bg-card px-3 py-1"
                              >
                                <Text className="text-center text-sm capitalize">
                                  {collaborator.role}
                                </Text>
                              </Pressable>
                            </MenuView>
                            <Pressable
                              onPress={() =>
                                handleRemoveCollaborator(
                                  collaborator.userId,
                                  collaborator.user.name,
                                )
                              }
                              disabled={removeCollaborator.isPending}
                              className="p-2"
                            >
                              <Trash2 size={18} color="#ef4444" />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    ))
                  ) : (
                    <View className="rounded-lg border border-dashed border-border p-8">
                      <Text className="text-center text-sm text-gray-600 dark:text-gray-400">
                        {readOnly
                          ? "No collaborators yet"
                          : "No collaborators yet. Add someone to get started!"}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View className="rounded-lg border border-dashed border-border p-8">
                  <Text className="text-center text-sm text-gray-600 dark:text-gray-400">
                    {readOnly
                      ? "No collaborators yet"
                      : "No collaborators yet. Add someone to get started!"}
                  </Text>
                </View>
              )}
            </View>

            {/* Close Button */}
            <View className="mt-6 border-t border-border pt-4">
              <Button variant="secondary" onPress={onClose}>
                <Text>Close</Text>
              </Button>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
