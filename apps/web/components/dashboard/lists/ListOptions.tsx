import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  tooltip,
  children,
}: {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  list: ZBookmarkList;
  // Shown on the trigger, which is a plain button: the menu puts the tooltip
  // around it, outside the menu's trigger, which cancels the pointer press the
  // tooltip closes on.
  tooltip?: string;
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

  // A dialog opened from the menu opens as the menu hands focus back to its
  // trigger, so the dialog returns focus there, rather than to the item that's
  // gone by then.
  const pendingDialog = useRef<(() => void) | null>(null);
  const openAfterMenuCloses = (open: () => void) => () => {
    pendingDialog.current = open;
  };

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
      onClick: openAfterMenuCloses(() => setEditModalOpen(true)),
    },
    {
      id: "share",
      title: t("lists.share_list"),
      icon: <Share className="size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: openAfterMenuCloses(() => setShareModalOpen(true)),
    },
    {
      id: "manage-collaborators",
      title: isOwner
        ? t("lists.collaborators.manage")
        : t("lists.collaborators.view"),
      icon: <Users className="size-4" />,
      visible: list.type === "manual",
      disabled: false,
      onClick: openAfterMenuCloses(() => setCollaboratorsModalOpen(true)),
    },
    {
      id: "new-nested-list",
      title: t("lists.new_nested_list"),
      icon: <Plus className="size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: openAfterMenuCloses(() => setNewNestedListModalOpen(true)),
    },
    {
      id: "merge-list",
      title: t("lists.merge_list"),
      icon: <FolderInput className="size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: openAfterMenuCloses(() => setMergeListModalOpen(true)),
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
      variant: "destructive" as const,
      onClick: openAfterMenuCloses(() => setLeaveListDialogOpen(true)),
    },
    {
      id: "delete",
      title: t("actions.delete"),
      icon: <Trash2 className="size-4" />,
      visible: isOwner,
      disabled: false,
      variant: "destructive" as const,
      onClick: openAfterMenuCloses(() => setDeleteListDialogOpen(true)),
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
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>{tooltip}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        onCloseAutoFocus={() => {
          // The menu focuses its trigger right after this, before the dialog
          // has rendered.
          pendingDialog.current?.();
          pendingDialog.current = null;
        }}
      >
        {visibleItems.map((item) => (
          <DropdownMenuItem
            key={item.id}
            variant={item.variant}
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
