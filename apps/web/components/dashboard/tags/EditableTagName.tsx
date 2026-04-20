"use client";

import { usePathname, useRouter } from "next/navigation";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import { useUpdateTag } from "@karakeep/shared-react/hooks/tags";

import { EditableText } from "../EditableText";

export default function EditableTagName({
  tag,
  className,
}: {
  tag: { id: string; name: string };
  className?: string;
}) {
  const router = useRouter();
  const currentPath = usePathname();
  const { mutate: updateTag, isPending } = useUpdateTag({
    onSuccess: () => {
      toast({
        description: "Tag updated!",
      });
      if (currentPath.includes(tag.id)) {
        router.refresh();
      }
    },
  });
  return (
    <EditableText
      viewClassName={className}
      editClassName={cn("p-2", className)}
      originalText={tag.name}
      onSave={(newName) => {
        if (!newName || newName == "") {
          toast({
            description: "You must set a name for the tag!",
            variant: "destructive",
          });
          return;
        }
        updateTag(
          {
            tagId: tag.id,
            name: newName,
          },
          {
            onError: (e) => {
              toast({
                description: e.message,
                variant: "destructive",
              });
            },
          },
        );
      }}
      isSaving={isPending}
    />
  );
}
