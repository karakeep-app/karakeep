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
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = React.useState(false);
  const label = isVisible
    ? t("common.hide_password")
    : t("common.show_password");

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
        size="icon"
        className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent focus-visible:ring-[3px] dark:hover:bg-transparent max-sm:size-11 [@media(pointer:coarse)]:size-11"
        tooltip={label}
        aria-label={label}
        aria-controls={id}
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
