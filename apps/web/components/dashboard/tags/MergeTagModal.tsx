import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "@/components/ui/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useMergeTag } from "@karakeep/shared-react/hooks/tags";

import { TagAutocomplete } from "./TagAutocomplete";

export function MergeTagModal({
  open,
  setOpen,
  tag,
  children,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  tag: { id: string; name: string };
  children?: React.ReactNode;
}) {
  const currentPath = usePathname();
  const router = useRouter();
  const formSchema = z.object({
    intoTagId: z.string(),
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      intoTagId: undefined,
    },
  });

  const { mutate: mergeTag, isPending } = useMergeTag({
    onSuccess: (resp) => {
      toast({
        description: "Tag has been updated!",
      });
      setOpen(false);
      if (currentPath.includes(tag.id)) {
        router.push(`/dashboard/tags/${resp.mergedIntoTagId}`);
      }
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
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

  return (
    <Dialog
      open={open}
      onOpenChange={(s) => {
        form.reset();
        setOpen(s);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((value) => {
              mergeTag({
                fromTagIds: [tag.id],
                intoTagId: value.intoTagId,
              });
            })}
          >
            <DialogHeader>
              <DialogTitle>Merge Tag</DialogTitle>
            </DialogHeader>

            <DialogDescription className="pt-4">
              You&apos;re about to move all the bookmarks in the tag &quot;
              {tag.name}&quot; into the tag you select.
            </DialogDescription>

            <FormField
              control={form.control}
              name="intoTagId"
              render={({ field }) => {
                return (
                  <FormItem className="grow py-4">
                    <FormControl>
                      <TagAutocomplete
                        tagId={field.value}
                        onChange={field.onChange}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <DialogFooter className="sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Close
                </Button>
              </DialogClose>
              <ActionButton type="submit" loading={isPending}>
                Save
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
