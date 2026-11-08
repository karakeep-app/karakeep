"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check } from "lucide-react";

import type { ZUserSettings } from "@karakeep/shared/types/users";
import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import { useTRPC } from "@karakeep/shared-react/trpc";

const SAVED_MS = 2000;
// Longer than the good news: it needs reading, and the value has jumped back.
const FAILED_MS = 6000;

/** Which autosaved field just saved or failed, cleared again after a moment. */
export function useSavedField<T extends string>() {
  const [result, setResult] = useState<{ field: T; failed: boolean } | null>(
    null,
  );
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const show = useCallback((field: T, failed: boolean) => {
    setResult({ field, failed });
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(
      () => setResult(null),
      failed ? FAILED_MS : SAVED_MS,
    );
  }, []);
  const markSaved = useCallback((field: T) => show(field, false), [show]);
  const markFailed = useCallback((field: T) => show(field, true), [show]);
  const clearSaved = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    setResult(null);
  }, []);

  return {
    savedField: result && !result.failed ? result.field : null,
    failedField: result?.failed ? result.field : null,
    markSaved,
    markFailed,
    clearSaved,
  };
}

/**
 * Autosaves user settings. The control shows the new value straight away rather
 * than after the round trip, jumps back if the save fails, and `useSavedField`
 * says which of the two happened.
 */
export function useAutosavedSettings<T extends string>() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const savedField = useSavedField<T>();
  const { mutate } = useUpdateUserSettings();
  const queryKey = api.users.settings.queryKey();

  const save = (field: T, value: Partial<ZUserSettings>) => {
    const previous = queryClient.getQueryData(queryKey);
    void queryClient.cancelQueries({ queryKey });
    if (previous) {
      queryClient.setQueryData(queryKey, { ...previous, ...value });
    }
    mutate(value, {
      onSuccess: () => savedField.markSaved(field),
      onError: () => {
        queryClient.setQueryData(queryKey, previous);
        savedField.markFailed(field);
      },
    });
  };

  return { ...savedField, save };
}

/**
 * The quiet result of an autosaved preference, right next to the control. The
 * live region is always mounted so screen readers announce the text when it
 * appears.
 */
export function SavedHint({
  show,
  failed = false,
}: {
  show: boolean;
  failed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        failed ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {failed ? (
        <>
          <AlertCircle className="size-4" />
          {t("settings.save_failed")}
        </>
      ) : (
        show && (
          <>
            <Check className="size-4" />
            {t("settings.saved")}
          </>
        )
      )}
    </span>
  );
}
