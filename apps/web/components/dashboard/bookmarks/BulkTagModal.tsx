import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";

import { useUpdateBookmarkTags } from "@karakeep/shared-react/hooks/bookmarks";
import { api } from "@karakeep/shared-react/trpc";
import { limitConcurrency } from "@karakeep/shared/concurrency";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { TagsEditor } from "./TagsEditor";

export default function BulkTagModal({
  bookmarkIds,
  open,
  setOpen,
}: {
  bookmarkIds: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const results = api.useQueries((t) =>
    bookmarkIds.map((id) => t.bookmarks.getBookmark({ bookmarkId: id })),
  );

  const bookmarks = results
    .map((r) => r.data)
    .filter((b): b is ZBookmark => !!b);

  const { mutateAsync } = useUpdateBookmarkTags({
    onError: (err) => {
      if (err.data?.code == "BAD_REQUEST") {
        if (err.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(err.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: err.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Something went wrong",
        });
      }
    },
  });

  const onAttach = async (tag: { tagName: string; tagId?: string }) => {
    const results = await Promise.allSettled(
      limitConcurrency(
        bookmarkIds.map(
          (id) => () =>
            mutateAsync({
              bookmarkId: id,
              attach: [tag],
              detach: [],
            }),
        ),
        50,
      ),
    );
    const successes = results.filter((r) => r.status == "fulfilled").length;
    toast({
      description: `Tag "${tag.tagName}" has been added to ${successes} bookmarks!`,
    });
  };

  const onDetach = async ({
    tagId,
    tagName,
  }: {
    tagId: string;
    tagName: string;
  }) => {
    const results = await Promise.allSettled(
      limitConcurrency(
        bookmarkIds.map(
          (id) => () =>
            mutateAsync({
              bookmarkId: id,
              attach: [],
              detach: [{ tagId }],
            }),
        ),
        50,
      ),
    );
    const successes = results.filter((r) => r.status == "fulfilled").length;
    toast({
      description: `Tag "${tagName}" has been removed from ${successes} bookmarks!`,
    });
  };

  // Get all the tags that are attached to all the bookmarks
  let tags = bookmarks
    .flatMap((b) => b.tags)
    .filter((tag) =>
      bookmarks.every((b) => b.tags.some((t) => tag.id == t.id)),
    );
  // Filter duplicates
  tags = tags.filter(
    (tag, index, self) => index === self.findIndex((t) => t.id == tag.id),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tags of {bookmarks.length} Bookmarks</DialogTitle>
        </DialogHeader>
        <TagsEditor tags={tags} onAttach={onAttach} onDetach={onDetach} />
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
