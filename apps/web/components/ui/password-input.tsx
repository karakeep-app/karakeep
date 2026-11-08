"use client";

import * as React from "react";
import { ButtonWithTooltip } from "@/components/ui/button";
import type { InputProps } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

/** A password field with a show/hide toggle. Starts hidden. */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, "type" | "endIcon">
>(({ className, id, disabled, ...props }, ref) => {
  // Don't suspend: the auth pages don't otherwise load translations on the
  // client, and waiting for them would delay hydrating the whole form, so text
  // typed in the meantime is lost. Fall back to English until they load.
  const { t } = useTranslation(undefined, { useSuspense: false });
  const [isVisible, setIsVisible] = React.useState(false);
  const label = isVisible
    ? t("common.hide_password", "Hide password")
    : t("common.show_password", "Show password");

  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        id={id}
        type={isVisible ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-11", className)}
        {...props}
      />
      <ButtonWithTooltip
        type="button"
        variant="ghost"
        size="icon-sm"
        // Inset so the focus ring stays inside the field; the ::after pads the
        // tap target to 44px without changing what's drawn.
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground after:absolute after:-inset-1.5 after:content-[''] hover:bg-transparent focus-visible:ring-[3px] dark:hover:bg-transparent"
        tooltip={label}
        aria-label={label}
        aria-controls={id}
        // Out of the tab order so tabbing goes field to field; it's still
        // clickable, and the field is just as usable without it.
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setIsVisible(!isVisible)}
      >
        {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </ButtonWithTooltip>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
