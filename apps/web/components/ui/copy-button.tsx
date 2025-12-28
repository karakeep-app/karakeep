import React, { useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

import { Button } from "./button";

export default function CopyBtn({
  className,
  getStringToCopy,
}: {
  className?: string;
  getStringToCopy: () => string;
}) {
  const [copyOk, setCopyOk] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  useEffect(() => {
    if (!navigator || !navigator.clipboard) {
      setDisabled(true);
    }
  });

  const handleClick = async () => {
    await navigator.clipboard.writeText(getStringToCopy());
    setCopyOk(true);
    setTimeout(() => {
      setCopyOk(false);
    }, 2000);
  };

  return (
    <button
      className={className}
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? "Copying is only available over https" : undefined}
    >
      {copyOk ? <Check /> : <Copy />}
    </button>
  );
}

export function CopyBtnV2({
  className,
  getStringToCopy,
}: {
  className?: string;
  getStringToCopy: () => string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        description:
          "Failed to copy link. Browsers only support copying to the clipboard from https pages.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => handleCopy(getStringToCopy())}
      className={cn("shrink-0", className)}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}
