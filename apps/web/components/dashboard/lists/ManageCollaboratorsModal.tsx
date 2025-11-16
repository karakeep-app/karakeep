"use client";

import { useState } from "react";
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
import { api } from "@/lib/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

export function ManageCollaboratorsModal({
  open: userOpen,
  setOpen: userSetOpen,
  list,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  list: ZBookmarkList;
  children?: React.ReactNode;
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

  const utils = api.useUtils();

  // Fetch collaborators
  const { data: collaboratorsData, isLoading } =
    api.lists.getCollaborators.useQuery(
      { listId: list.id },
      { enabled: open },
    );

  // Mutations
  const addCollaborator = api.lists.addCollaborator.useMutation({
    onSuccess: () => {
      toast.success("Collaborator added successfully");
      setNewCollaboratorEmail("");
      utils.lists.getCollaborators.invalidate({ listId: list.id });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add collaborator");
    },
  });

  const removeCollaborator = api.lists.removeCollaborator.useMutation({
    onSuccess: () => {
      toast.success("Collaborator removed");
      utils.lists.getCollaborators.invalidate({ listId: list.id });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove collaborator");
    },
  });

  const updateCollaboratorRole = api.lists.updateCollaboratorRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.lists.getCollaborators.invalidate({ listId: list.id });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  const handleAddCollaborator = () => {
    if (!newCollaboratorEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    // In a real implementation, you'd look up the user by email first
    // For now, we'll assume the email is a userId
    addCollaborator.mutate({
      listId: list.id,
      userId: newCollaboratorEmail, // This should be the actual userId
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
            Manage Collaborators
          </DialogTitle>
          <DialogDescription>
            Add or remove people who can access this list
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add Collaborator Section */}
          <div className="space-y-3">
            <Label>Add Collaborator</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Enter user ID or email"
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
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
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
              <strong>Viewer:</strong> Can view bookmarks in the list
              <br />
              <strong>Editor:</strong> Can add and remove bookmarks
            </p>
          </div>

          {/* Current Collaborators */}
          <div className="space-y-3">
            <Label>Current Collaborators</Label>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : collaboratorsData && collaboratorsData.collaborators.length > 0 ? (
              <div className="space-y-2">
                {collaboratorsData.collaborators.map((collaborator) => (
                  <div
                    key={collaborator.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{collaborator.user.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {collaborator.user.email}
                      </div>
                    </div>
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
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
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
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No collaborators yet. Add someone to start collaborating!
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
