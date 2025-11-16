import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useShowArchived } from "@/components/utils/useShowArchived";
import { useTranslation } from "@/lib/i18n/client";
import {
  DoorOpen,
  FolderInput,
  Pencil,
  Plus,
  Share,
  Square,
  SquareCheck,
  Trash2,
  Users,
} from "lucide-react";

import { ZBookmarkList } from "@karakeep/shared/types/lists";

import { EditListModal } from "../lists/EditListModal";
import DeleteListConfirmationDialog from "./DeleteListConfirmationDialog";
import LeaveListConfirmationDialog from "./LeaveListConfirmationDialog";
import { ManageCollaboratorsModal } from "./ManageCollaboratorsModal";
import { MergeListModal } from "./MergeListModal";
import { ShareListModal } from "./ShareListModal";

export function ListOptions({
  list,
  isOpen,
  onOpenChange,
  children,
}: {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  list: ZBookmarkList;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { showArchived, onClickShowArchived } = useShowArchived();

  const [deleteListDialogOpen, setDeleteListDialogOpen] = useState(false);
  const [leaveListDialogOpen, setLeaveListDialogOpen] = useState(false);
  const [newNestedListModalOpen, setNewNestedListModalOpen] = useState(false);
  const [mergeListModalOpen, setMergeListModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [collaboratorsModalOpen, setCollaboratorsModalOpen] = useState(false);

  // Only owners can manage the list (edit, delete, manage collaborators, etc.)
  const isOwner = list.userRole === "owner";
  // Collaborators (non-owners) can leave the list
  const isCollaborator =
    list.userRole === "editor" || list.userRole === "viewer";

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <ShareListModal
        open={shareModalOpen}
        setOpen={setShareModalOpen}
        list={list}
      />
      <ManageCollaboratorsModal
        open={collaboratorsModalOpen}
        setOpen={setCollaboratorsModalOpen}
        list={list}
      />
      <EditListModal
        open={newNestedListModalOpen}
        setOpen={setNewNestedListModalOpen}
        prefill={{
          parentId: list.id,
        }}
      />
      <EditListModal
        open={editModalOpen}
        setOpen={setEditModalOpen}
        list={list}
      />
      <MergeListModal
        open={mergeListModalOpen}
        setOpen={setMergeListModalOpen}
        list={list}
      />
      <DeleteListConfirmationDialog
        list={list}
        open={deleteListDialogOpen}
        setOpen={setDeleteListDialogOpen}
      />
      <LeaveListConfirmationDialog
        list={list}
        open={leaveListDialogOpen}
        setOpen={setLeaveListDialogOpen}
      />
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent>
        {isOwner && (
          <DropdownMenuItem
            className="flex gap-2"
            onClick={() => setEditModalOpen(true)}
          >
            <Pencil className="size-4" />
            <span>{t("actions.edit")}</span>
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem
            className="flex gap-2"
            onClick={() => setShareModalOpen(true)}
          >
            <Share className="size-4" />
            <span>{t("lists.share_list")}</span>
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem
            className="flex gap-2"
            onClick={() => setCollaboratorsModalOpen(true)}
          >
            <Users className="size-4" />
            <span>Manage Collaborators</span>
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem
            className="flex gap-2"
            onClick={() => setNewNestedListModalOpen(true)}
          >
            <Plus className="size-4" />
            <span>{t("lists.new_nested_list")}</span>
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem
            className="flex gap-2"
            onClick={() => setMergeListModalOpen(true)}
          >
            <FolderInput className="size-4" />
            <span>{t("lists.merge_list")}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="flex gap-2" onClick={onClickShowArchived}>
          {showArchived ? (
            <SquareCheck className="size-4" />
          ) : (
            <Square className="size-4" />
          )}
          <span>{t("actions.toggle_show_archived")}</span>
        </DropdownMenuItem>
        {isCollaborator && (
          <DropdownMenuItem
            className="flex gap-2 text-destructive"
            onClick={() => setLeaveListDialogOpen(true)}
          >
            <DoorOpen className="size-4" />
            <span>Leave List</span>
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem
            className="flex gap-2 text-destructive"
            onClick={() => setDeleteListDialogOpen(true)}
          >
            <Trash2 className="size-4" />
            <span>{t("actions.delete")}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
