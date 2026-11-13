"use client";

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      // Sonner's phone layout makes up for its offset on the toasts rather than on
      // this, which would have them off-centre now that they size to their content
      className="toaster group max-[600px]:!w-[calc(100%-2*var(--mobile-offset-left))]"
      position="bottom-center"
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4 text-destructive" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          // A modal dialog makes the body inert, and toasts live outside of it.
          // Their actions, like Undo, still have to work over a dialog.
          // As wide as their content.
          toast:
            "group toast group-[.toaster]:pointer-events-auto group-[.toaster]:inset-x-0 group-[.toaster]:mx-auto group-[.toaster]:w-fit group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg dark:group-[.toaster]:border-foreground/25 dark:group-[.toaster]:bg-accent",
          // A tint over the toast's own surface, which has to stay opaque
          error:
            "from-destructive/10 to-destructive/10 group-[.toaster]:bg-gradient-to-b group-[.toaster]:!border-destructive/40",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

/**
 * Compat layer for migrating from old toaster to sonner
 * @deprecated Use sonner's natie toast instead
 */
const legacyToast = ({
  title,
  description,
  variant,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "destructive" | "default";
}) => {
  let toastTitle = title;
  let toastDescription: React.ReactNode | undefined = description;
  if (!title) {
    toastTitle = description;
    toastDescription = undefined;
  }
  if (variant === "destructive") {
    toast.error(toastTitle, { description: toastDescription });
  } else {
    // Plain toast() has no icon, and every toast has to have one
    toast.success(toastTitle, { description: toastDescription });
  }
};

export { Toaster, legacyToast as toast };
