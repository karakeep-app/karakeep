import type * as LabelPrimitive from "@radix-ui/react-label";
import type {
  ControllerProps,
  FieldPath,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import type { z } from "zod";
import * as React from "react";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { Controller, FormProvider, useFormContext } from "react-hook-form";

const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

interface FormItemContextValue {
  id: string;
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { formItemId } = useFormField();

  // Stays neutral on error: the field's border and message already say it.
  return (
    <Label ref={ref} className={className} htmlFor={formItemId} {...props} />
  );
});
FormLabel.displayName = "FormLabel";

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn(
        "text-[13px] leading-[18px] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = "FormMessage";

/**
 * Zod's default messages read like type errors ("Too small: expected array to
 * have >=1 items"). The shared schemas stay as they are for the API, and forms
 * pass this to `zodResolver` to say how to recover instead. `fieldMessages` gives
 * a field its own message, for when "Select at least one" isn't specific enough.
 * A string that's too long keeps "Use at most N characters", as a field's own
 * message is usually about leaving it empty. Messages set on the schema itself
 * still win over all of this.
 */
function useFormErrors(fieldMessages?: Record<string, string>): {
  error: z.core.$ZodErrorMap;
} {
  const { t } = useTranslation();
  return {
    error: (issue) => {
      const field = issue.path?.[0];
      const fieldMessage =
        typeof field === "string" ? fieldMessages?.[field] : undefined;
      switch (issue.code) {
        case "too_small": {
          const minimum = Number(issue.minimum);
          if (fieldMessage) {
            return fieldMessage;
          }
          if (issue.origin === "array") {
            return t("form_errors.select_at_least", { count: minimum });
          }
          if (issue.origin === "string") {
            return minimum <= 1
              ? t("form_errors.required")
              : t("form_errors.string_min", { count: minimum });
          }
          return t("form_errors.number_min", { count: minimum });
        }
        case "too_big": {
          const maximum = Number(issue.maximum);
          return issue.origin === "string"
            ? t("form_errors.string_max", { count: maximum })
            : (fieldMessage ?? t("form_errors.number_max", { count: maximum }));
        }
        case "invalid_format":
          if (fieldMessage) {
            return fieldMessage;
          }
          if (issue.format === "url") {
            return t("form_errors.url");
          }
          return issue.format === "email" ? t("form_errors.email") : undefined;
        case "invalid_type":
          return (
            fieldMessage ??
            t(
              issue.expected === "number"
                ? "form_errors.number"
                : "form_errors.required",
            )
          );
        default:
          return fieldMessage;
      }
    },
  };
}

/** The parts of a tRPC client error that say which fields it's about. */
interface ServerFormError {
  message: string;
  data?: {
    code?: string;
    zodError?: { fieldErrors: Record<string, string[] | undefined> } | null;
  } | null;
}

/**
 * Shows a failed mutation under the field it's about. The server's own field
 * errors go to their fields, and a rejected value (a duplicate name, say) goes to
 * `rejectedField`, with `rejectedMessage` in place of the server's wording.
 * Returns false when nothing landed on a field, so the caller can use a toast.
 */
function setServerFormErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: ServerFormError,
  {
    rejectedField,
    rejectedMessage,
  }: { rejectedField?: FieldPath<T>; rejectedMessage?: string } = {},
): boolean {
  if (error.data?.code !== "BAD_REQUEST") {
    return false;
  }
  const fieldErrors = Object.entries(error.data.zodError?.fieldErrors ?? {});
  const known = fieldErrors.filter(([name]) =>
    Object.keys(form.getValues()).includes(name),
  );
  if (known.length > 0) {
    known.forEach(([name, messages], index) =>
      form.setError(
        name as FieldPath<T>,
        { message: messages?.[0] },
        { shouldFocus: index === 0 },
      ),
    );
    return true;
  }
  if (fieldErrors.length === 0 && rejectedField) {
    form.setError(
      rejectedField,
      { message: rejectedMessage ?? error.message },
      { shouldFocus: true },
    );
    return true;
  }
  return false;
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  useFormErrors,
  setServerFormErrors,
};
