import { useCallback } from "react";
import { useUserSettings } from "@/lib/userSettings";
import { parseAsBoolean, useQueryState } from "nuqs";

export function useShowArchived() {
  const userSettings = useUserSettings();
  const [showArchived, setShowArchived] = useQueryState(
    "includeArchived",
    parseAsBoolean
      .withOptions({
        shallow: false,
      })
      .withDefault(userSettings.archiveDisplayBehaviour === "show"),
  );

  const onClickShowArchived = useCallback(() => {
    setShowArchived((prev) => !prev);
  }, [setShowArchived]);

  return {
    showArchived,
    onClickShowArchived,
  };
}
