"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { AlertTriangle, Check, Copy } from "lucide-react";

const COPIED_VISIBLE_MS = 2000;

export default function ApiKeySuccess({
  apiKey,
  note,
}: {
  apiKey: string;
  /** What else changed, on top of the key only being shown this once. */
  note?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(
        () => setCopied(false),
        COPIED_VISIBLE_MS,
      );
    } catch {
      toast({
        description: t("settings.api_keys.copy_failed"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          {t("settings.api_keys.key_shown_once")}
        </p>
        {note && <p className="text-muted-foreground">{note}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={apiKey}
          readOnly
          aria-label={t("settings.api_keys.your_key")}
          className="font-mono"
          onFocus={(e) => e.target.select()}
        />
        <Button type="button" className="shrink-0" onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("actions.copied") : t("actions.copy")}
        </Button>
      </div>
      <span role="status" className="sr-only">
        {copied ? t("actions.copied") : ""}
      </span>
    </div>
  );
}
