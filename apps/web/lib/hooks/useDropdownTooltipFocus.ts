import type { FocusEvent } from "react";
import { useRef } from "react";

export function useDropdownTooltipFocus() {
  const restoringFocus = useRef(false);

  return {
    onTriggerFocus: (event: FocusEvent<HTMLButtonElement>) => {
      if (restoringFocus.current) {
        // Cancel the tooltip's focus handler, not the menu's focus restoration.
        event.preventDefault();
      }
    },
    onCloseAutoFocus: () => {
      // Radix restores trigger focus synchronously after this callback.
      restoringFocus.current = true;
      queueMicrotask(() => {
        restoringFocus.current = false;
      });
    },
  };
}
