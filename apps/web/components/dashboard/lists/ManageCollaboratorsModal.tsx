"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";

import { ZBookmarkList } from "@karakeep/shared/types/lists";

export function ManageCollaboratorsModal({
  open: userOpen,
  setOpen: userSetOpen,
  list,
  children,
  readOnly = false,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  list: ZBookmarkList;
  children?: React.ReactNode;
  readOnly?: boolean;
}) {
  if (
    (userOpen !== undefined && !userSetOpen) ||
    (userOpen === undefined && userSetOpen)
  ) {
    throw new Error("You must provide both open and setOpen or neither");
  }
  const [customOpen, customSetOpen] = useState(false);
  const [open, setOpen] = [
    userOpen ?? customOpen,
    userSetOpen ?? customSetOpen,
  ];

  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState("");
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<
    "viewer" | "editor"
  >("viewer");

  const { t } = useTranslation();
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
    api.lists.getCollaborators.useQuery({ listId: list.id }, { enabled: open });

  // Mutations
  const addCollaborator = api.lists.addCollaborator.useMutation({
    onSuccess: async () => {
      toast({
        description: t("lists.collaborators.invitation_sent"),
      });
      setNewCollaboratorEmail("");
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: error.message || t("lists.collaborators.failed_to_add"),
      });
    },
  });

  const removeCollaborator = api.lists.removeCollaborator.useMutation({
    onSuccess: async () => {
      toast({
        description: t("lists.collaborators.removed"),
      });
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: error.message || t("lists.collaborators.failed_to_remove"),
      });
    },
  });

  const updateCollaboratorRole = api.lists.updateCollaboratorRole.useMutation({
    onSuccess: async () => {
      toast({
        description: t("lists.collaborators.role_updated"),
      });
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description:
          error.message || t("lists.collaborators.failed_to_update_role"),
      });
    },
  });

  const revokeInvitation = api.lists.revokeInvitation.useMutation({
    onSuccess: async () => {
      toast({
        description: t("lists.collaborators.invitation_revoked"),
      });
      await invalidateListCaches();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: error.message || t("lists.collaborators.failed_to_revoke"),
      });
    },
  });

  const handleAddCollaborator = () => {
    if (!newCollaboratorEmail.trim()) {
      toast({
        variant: "destructive",
        description: t("lists.collaborators.please_enter_email"),
      });
      return;
    }

    addCollaborator.mutate({
      listId: list.id,
      email: newCollaboratorEmail,
      role: newCollaboratorRole,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(s) => {
        setOpen(s);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {readOnly
              ? t("lists.collaborators.collaborators")
              : t("lists.collaborators.manage")}
            <Badge className="bg-green-600 text-white hover:bg-green-600/80">
              Beta
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? t("lists.collaborators.people_with_access")
              : t("lists.collaborators.add_or_remove")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add Collaborator Section */}
          {!readOnly && (
            <div className="space-y-3">
              <Label>{t("lists.collaborators.add")}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder={t("lists.collaborators.enter_email")}
                    value={newCollaboratorEmail}
                    onChange={(e) => setNewCollaboratorEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddCollaborator();
                      }
                    }}
                  />
                </div>
                <Select
                  value={newCollaboratorRole}
                  onValueChange={(value) =>
                    setNewCollaboratorRole(value as "viewer" | "editor")
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">
                      {t("lists.collaborators.viewer")}
                    </SelectItem>
                    <SelectItem value="editor">
                      {t("lists.collaborators.editor")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddCollaborator}
                  disabled={addCollaborator.isPending}
                >
                  {addCollaborator.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>{t("lists.collaborators.viewer")}:</strong>{" "}
                {t("lists.collaborators.viewer_description")}
                <br />
                <strong>{t("lists.collaborators.editor")}:</strong>{" "}
                {t("lists.collaborators.editor_description")}
              </p>
            </div>
          )}

          {/* Current Collaborators */}
          <div className="space-y-3">
            <Label>
              {readOnly
                ? t("lists.collaborators.collaborators")
                : t("lists.collaborators.current")}
            </Label>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : collaboratorsData ? (
              <div className="space-y-2">
                {/* Show owner first */}
                {collaboratorsData.owner && (
                  <div
                    key={`owner-${collaboratorsData.owner.id}`}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <UserAvatar
                        name={collaboratorsData.owner.name}
                        image={collaboratorsData.owner.image}
                        className="size-10 ring-1 ring-border"
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          {collaboratorsData.owner.name}
                        </div>
                        {collaboratorsData.owner.email && (
                          <div className="text-sm text-muted-foreground">
                            {collaboratorsData.owner.email}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm capitalize text-muted-foreground">
                      {t("lists.collaborators.owner")}
                    </div>
                  </div>
                )}
                {/* Show collaborators */}
                {collaboratorsData.collaborators.length > 0 ? (
                  collaboratorsData.collaborators.map((collaborator) => (
                    <div
                      key={collaborator.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <UserAvatar
                          name={collaborator.user.name}
                          image={collaborator.user.image}
                          className="size-10 ring-1 ring-border"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">
                              {collaborator.user.name}
                            </div>
                            {collaborator.status === "pending" && (
                              <Badge variant="outline" className="text-xs">
                                {t("lists.collaborators.pending")}
                              </Badge>
                            )}
                            {collaborator.status === "declined" && (
                              <Badge variant="destructive" className="text-xs">
                                {t("lists.collaborators.declined")}
                              </Badge>
                            )}
                          </div>
                          {collaborator.user.email && (
                            <div className="text-sm text-muted-foreground">
                              {collaborator.user.email}
                            </div>
                          )}
                        </div>
                      </div>
                      {readOnly ? (
                        <div className="text-sm capitalize text-muted-foreground">
                          {collaborator.role}
                        </div>
                      ) : collaborator.status !== "accepted" ? (
                        <div className="flex items-center gap-2">
                          <div className="text-sm capitalize text-muted-foreground">
                            {collaborator.role}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              revokeInvitation.mutate({
                                invitationId: collaborator.id,
                              })
                            }
                            disabled={revokeInvitation.isPending}
                          >
                            {t("lists.collaborators.revoke")}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Select
                            value={collaborator.role}
                            onValueChange={(value) =>
                              updateCollaboratorRole.mutate({
                                listId: list.id,
                                userId: collaborator.userId,
                                role: value as "viewer" | "editor",
                              })
                            }
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">
                                {t("lists.collaborators.viewer")}
                              </SelectItem>
                              <SelectItem value="editor">
                                {t("lists.collaborators.editor")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeCollaborator.mutate({
                                listId: list.id,
                                userId: collaborator.userId,
                              })
                            }
                            disabled={removeCollaborator.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                ) : !collaboratorsData.owner ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {readOnly
                      ? t("lists.collaborators.no_collaborators_readonly")
                      : t("lists.collaborators.no_collaborators")}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {readOnly
                  ? t("lists.collaborators.no_collaborators_readonly")
                  : t("lists.collaborators.no_collaborators")}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
