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

  // Define action items array
  const actionItems = [
    {
      id: "edit",
      title: t("actions.edit"),
      icon: <Pencil className="size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: () => setEditModalOpen(true),
    },
    {
      id: "share",
      title: t("lists.share_list"),
      icon: <Share className="size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: () => setShareModalOpen(true),
    },
    {
      id: "manage-collaborators",
      title: isOwner
        ? t("lists.collaborators.manage")
        : t("lists.collaborators.view"),
      icon: <Users className="size-4" />,
      visible: list.type === "manual",
      disabled: false,
      onClick: () => setCollaboratorsModalOpen(true),
    },
    {
      id: "new-nested-list",
      title: t("lists.new_nested_list"),
      icon: <Plus className="size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: () => setNewNestedListModalOpen(true),
    },
    {
      id: "merge-list",
      title: t("lists.merge_list"),
      icon: <FolderInput className="size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: () => setMergeListModalOpen(true),
    },
    {
      id: "toggle-archived",
      title: t("actions.toggle_show_archived"),
      icon: showArchived ? (
        <SquareCheck className="size-4" />
      ) : (
        <Square className="size-4" />
      ),
      visible: isOwner,
      disabled: false,
      onClick: onClickShowArchived,
    },
    {
      id: "leave-list",
      title: t("lists.leave_list.action"),
      icon: <DoorOpen className="size-4" />,
      visible: isCollaborator,
      disabled: false,
      className: "flex gap-2 text-destructive",
      onClick: () => setLeaveListDialogOpen(true),
    },
    {
      id: "delete",
      title: t("actions.delete"),
      icon: <Trash2 className="size-4" />,
      visible: isOwner,
      disabled: false,
      className: "flex gap-2 text-destructive",
      onClick: () => setDeleteListDialogOpen(true),
    },
  ];

  // Filter visible items
  const visibleItems = actionItems.filter((item) => item.visible);

  // If no items are visible, don't render the dropdown
  if (visibleItems.length === 0) {
    return null;
  }

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
        readOnly={!isOwner}
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
        {visibleItems.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className={item.className ?? "flex gap-2"}
            disabled={item.disabled}
            onClick={item.onClick}
          >
            {item.icon}
            <span>{item.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
