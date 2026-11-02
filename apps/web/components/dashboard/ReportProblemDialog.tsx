"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import {
  getRecentErrors,
  setRecentErrorsOwner,
} from "@/lib/problemReport/recentErrors";
import { useProblemReportStore } from "@/lib/store/useProblemReportStore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { ZProblemReportClientDiagnostics } from "@karakeep/shared/types/problemReports";
import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  PROBLEM_REPORT_CATEGORIES,
  zProblemReportCategorySchema,
} from "@karakeep/shared/types/problemReports";

const DIALOG_CLOSE_RESET_DELAY_MS = 200;

const formSchema = z.object({
  category: zProblemReportCategorySchema,
  description: z.string().trim().min(10).max(5000),
  includeDiagnostics: z.boolean(),
});

function collectDiagnostics(theme?: string): ZProblemReportClientDiagnostics {
  // Truncate to the server-side limits so that, for example, a long search
  // query in the URL doesn't cause the whole report to be rejected.
  return {
    pageUrl: window.location.href.slice(0, 2000),
    userAgent: navigator.userAgent.slice(0, 1000),
    language: navigator.language.slice(0, 100),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 100),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    theme,
    online: navigator.onLine,
    clientTimestamp: new Date().toISOString(),
    recentErrors: getRecentErrors(),
  };
}

export default function ReportProblemDialog() {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: session } = useSession();
  const { resolvedTheme } = useTheme();
  const open = useProblemReportStore((s) => s.open);
  const setOpen = useProblemReportStore((s) => s.setOpen);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    setRecentErrorsOwner(userId);
  }, [userId]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "bug",
      description: "",
      includeDiagnostics: true,
    },
  });

  // Snapshot the diagnostics when the dialog opens so that they reflect the
  // page the user was on, and what we show is exactly what we send.
  const diagnostics = useMemo(
    () => (open ? collectDiagnostics(resolvedTheme) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  useEffect(() => {
    if (open) return;
    const timeout = setTimeout(() => {
      form.reset();
      setSubmittedReportId(null);
      setDetailsOpen(false);
    }, DIALOG_CLOSE_RESET_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [open, form]);

  const { mutate, isPending } = useMutation(
    api.problemReports.submit.mutationOptions({
      onSuccess: (res) => {
        // If the dialog was closed while the report was in flight, don't
        // populate the success screen (it'd show up the next time the
        // dialog is opened). Confirm with a toast instead.
        if (!useProblemReportStore.getState().open) {
          toast.success(t("problem_report.toasts.sent"));
          return;
        }
        setSubmittedReportId(res.reportId);
      },
      onError: (e) =>
        toast.error(e.message || t("problem_report.toasts.failed")),
    }),
  );

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutate({
      category: values.category,
      description: values.description,
      diagnostics: values.includeDiagnostics ? diagnostics : undefined,
    });
  };

  const includeDiagnostics = form.watch("includeDiagnostics");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {submittedReportId ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="size-12 text-green-600" />
            <DialogTitle>{t("problem_report.success.title")}</DialogTitle>
            <DialogDescription className="text-pretty">
              {session?.user.email
                ? t("problem_report.success.description_with_email", {
                    email: session.user.email,
                  })
                : t("problem_report.success.description")}
            </DialogDescription>
            <p className="font-mono text-xs text-muted-foreground">
              {t("problem_report.success.reference", {
                id: submittedReportId,
              })}
            </p>
            <DialogClose asChild>
              <Button className="mt-2">{t("actions.close")}</Button>
            </DialogClose>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("problem_report.title")}</DialogTitle>
              <DialogDescription>
                {t("problem_report.description")}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
              >
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("problem_report.category")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROBLEM_REPORT_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {t(`problem_report.categories.${c}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("problem_report.what_happened")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={6}
                          maxLength={5000}
                          placeholder={t(
                            "problem_report.what_happened_placeholder",
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="includeDiagnostics"
                  render={({ field }) => (
                    <FormItem className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <FormLabel>
                            {t("problem_report.include_diagnostics")}
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            {t(
                              "problem_report.include_diagnostics_description",
                            )}
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      {includeDiagnostics && diagnostics && (
                        <Collapsible
                          open={detailsOpen}
                          onOpenChange={setDetailsOpen}
                        >
                          <CollapsibleTrigger className="flex items-center gap-1 pt-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                            <ChevronRight
                              className={`size-4 transition-transform ${detailsOpen ? "rotate-90" : ""}`}
                            />
                            {t("problem_report.view_diagnostics", {
                              count: diagnostics.recentErrors?.length ?? 0,
                            })}
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">
                              {JSON.stringify(diagnostics, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </FormItem>
                  )}
                />
                <DialogFooter className="gap-2 sm:gap-0">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      {t("actions.cancel")}
                    </Button>
                  </DialogClose>
                  <ActionButton type="submit" loading={isPending}>
                    {t("problem_report.submit")}
                  </ActionButton>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
