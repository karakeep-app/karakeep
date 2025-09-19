import type { FieldValues, UseFormReturn } from "react-hook-form";
import { useEffect, useRef } from "react";

/**
 * Custom hook to handle form reset behavior in dialogs
 * Only resets the form when the dialog transitions from closed to open,
 * preventing loss of unsaved changes when external data updates occur
 *
 * @param open - Dialog open state
 * @param form - React Hook Form instance
 * @param resetData - Data to reset the form with
 */
export function useDialogFormReset<T extends FieldValues>(
  open: boolean,
  form: UseFormReturn<T>,
  resetData: T,
) {
  const prevOpenRef = useRef(open);

  useEffect(() => {
    // Only reset form when transitioning from closed to open, not on data updates
    if (open && !prevOpenRef.current) {
      form.reset(resetData);
    }
    prevOpenRef.current = open;
  }, [open, form, resetData]);
}
