"use client";

import React from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import FormattedDate from "@/components/ui/formatted-date";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormErrors,
} from "@/components/ui/form";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useUserSettings } from "@/lib/userSettings";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  DatabaseBackup,
  Download,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { zBackupSchema } from "@karakeep/shared/types/backups";
import { zUpdateBackupSettingsSchema } from "@karakeep/shared/types/users";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  StackedLabel,
  stackedTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { RowActionsMenu } from "./RowActions";
import { SavedHint, useSavedField } from "./SavedHint";
import { SettingsRow, SettingsRows, SettingsSection } from "./SettingsPage";

type BackupField = keyof z.infer<typeof zUpdateBackupSettingsSchema>;

function BackupConfigurationForm() {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const settings = useUserSettings();
  const { savedField, failedField, markSaved, markFailed, clearSaved } =
    useSavedField<BackupField>();
  const { mutate: updateSettings } = useUpdateUserSettings();

  const form = useForm<z.infer<typeof zUpdateBackupSettingsSchema>>({
    resolver: zodResolver(
      zUpdateBackupSettingsSchema,
      useFormErrors({
        backupsRetentionDays: t(
          "settings.backups.configuration.retention_period_error",
        ),
      }),
    ),
    values: settings
      ? {
          backupsEnabled: settings.backupsEnabled,
          backupsFrequency: settings.backupsFrequency,
          backupsRetentionDays: settings.backupsRetentionDays,
        }
      : undefined,
    // A settings refetch, which every save causes, shouldn't overwrite a retention
    // value being typed or clear the error on it.
    resetOptions: { keepDirtyValues: true, keepErrors: true },
  });
  // "Saved" next to an error reads as if the rejected value went through.
  const hasError = Object.keys(form.formState.errors).length > 0;
  const hint = (field: BackupField) => (
    <SavedHint
      show={savedField === field && !hasError}
      failed={failedField === field}
    />
  );

  const lastSentRef = React.useRef<Partial<Record<BackupField, unknown>>>({});
  const saveField = async <K extends BackupField>(field: K) => {
    if (!(await form.trigger(field))) {
      clearSaved();
      return;
    }
    const value = form.getValues(field);
    // Compared with the last value sent rather than the saved one, so changing
    // a field back while its first save is in flight still saves.
    const lastSent =
      field in lastSentRef.current
        ? lastSentRef.current[field]
        : form.formState.defaultValues?.[field];
    if (value === lastSent) {
      return;
    }
    lastSentRef.current[field] = value;
    updateSettings(
      { [field]: value },
      {
        onSuccess: () => {
          // A newer save of this field is in flight and decides what it shows.
          if (lastSentRef.current[field] !== value) {
            return;
          }
          delete lastSentRef.current[field];
          form.resetField(field, { defaultValue: value });
          markSaved(field);
        },
        onError: () => {
          if (lastSentRef.current[field] !== value) {
            return;
          }
          delete lastSentRef.current[field];
          // Back to what's actually saved, rather than what looks saved. The
          // settings refetch corrects this if an earlier save did land.
          form.resetField(field);
          markFailed(field);
        },
      },
    );
  };

  const isEnabled = useWatch({ control: form.control, name: "backupsEnabled" });
  const isReadOnly = !!clientConfig.demoMode;
  const isScheduleDisabled = isReadOnly || !isEnabled;

  return (
    <SettingsSection title={t("settings.backups.configuration.title")}>
      <Form {...form}>
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <SettingsRows>
            <FormField
              control={form.control}
              name="backupsEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-6 space-y-0">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <FormLabel>
                      {t(
                        "settings.backups.configuration.enable_automatic_backups",
                      )}
                    </FormLabel>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {hint("backupsEnabled")}
                    <FormControl>
                      <Switch
                        disabled={isReadOnly}
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          void saveField("backupsEnabled");
                        }}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="backupsFrequency"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <SettingsRow
                    label={
                      <FormLabel
                        className={cn(!isEnabled && "text-muted-foreground")}
                      >
                        {t("settings.backups.configuration.backup_frequency")}
                      </FormLabel>
                    }
                    description={t(
                      "settings.backups.configuration.backup_frequency_description",
                    )}
                    hint={hint("backupsFrequency")}
                  >
                    <Select
                      disabled={isScheduleDisabled}
                      onValueChange={(value) => {
                        field.onChange(value);
                        void saveField("backupsFrequency");
                      }}
                      value={field.value}
                      name={field.name}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t(
                              "settings.backups.configuration.select_frequency",
                            )}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">
                          {t("settings.backups.configuration.frequency.daily")}
                        </SelectItem>
                        <SelectItem value="weekly">
                          {t("settings.backups.configuration.frequency.weekly")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="mt-2" />
                  </SettingsRow>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="backupsRetentionDays"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <SettingsRow
                    label={
                      <FormLabel
                        className={cn(!isEnabled && "text-muted-foreground")}
                      >
                        {t("settings.backups.configuration.retention_period")}
                      </FormLabel>
                    }
                    description={t(
                      "settings.backups.configuration.retention_period_description",
                    )}
                    hint={hint("backupsRetentionDays")}
                  >
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        {...field}
                        disabled={isScheduleDisabled}
                        value={
                          Number.isNaN(field.value) ? "" : (field.value ?? "")
                        }
                        onChange={(e) => {
                          field.onChange(parseInt(e.target.value));
                          clearSaved();
                          // The error goes as soon as the value is fixed.
                          if (form.formState.errors.backupsRetentionDays) {
                            void form.trigger("backupsRetentionDays");
                          }
                        }}
                        // Saved on leaving the field: keeping 14 days shouldn't
                        // pass through keeping 1 day on the way there.
                        onBlur={() => {
                          field.onBlur();
                          void saveField("backupsRetentionDays");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void saveField("backupsRetentionDays");
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage className="mt-2" />
                  </SettingsRow>
                </FormItem>
              )}
            />
          </SettingsRows>
        </form>
      </Form>
    </SettingsSection>
  );
}

function BackupRow({ backup }: { backup: z.infer<typeof zBackupSchema> }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const { mutate: deleteBackup, isPending: isDeleting } = useMutation(
    api.backups.delete.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.backups.toasts.backup_deleted"),
        });
        queryClient.invalidateQueries(api.backups.list.pathFilter());
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
    }),
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const downloadUrl =
    backup.assetId && backup.status === "success"
      ? getAssetUrl(backup.assetId)
      : undefined;

  return (
    <TableRow className={stackedTable.row}>
      <TableCell className={stackedTable.primaryCell}>
        <FormattedDate date={backup.createdAt} />
      </TableCell>
      <TableCell className={stackedTable.cell}>
        <StackedLabel>
          {t("settings.backups.list.table.bookmarks")}
        </StackedLabel>
        {backup.status === "pending"
          ? "-"
          : backup.bookmarkCount.toLocaleString()}
      </TableCell>
      <TableCell className={stackedTable.cell}>
        <StackedLabel>{t("settings.backups.list.table.size")}</StackedLabel>
        {backup.status === "pending" ? "-" : formatSize(backup.size)}
      </TableCell>
      <TableCell className={stackedTable.cell}>
        {backup.status === "success" ? (
          <span className="flex items-center gap-1">
            <CheckCircle className="size-4 text-green-500" />
            {t("settings.backups.list.status.success")}
          </span>
        ) : backup.status === "failure" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1">
                <XCircle className="size-4 text-red-500" />
                {t("settings.backups.list.status.failed")}
              </span>
            </TooltipTrigger>
            <TooltipContent>{backup.errorMessage}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="flex items-center gap-1">
            <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-muted-foreground" />
            {t("settings.backups.list.status.pending")}
          </span>
        )}
      </TableCell>
      <TableCell className={stackedTable.actionsCell}>
        <ActionConfirmingDialog
          open={deleteOpen}
          setOpen={setDeleteOpen}
          title={t("settings.backups.dialogs.delete_backup_title")}
          description={t("settings.backups.dialogs.delete_backup_description")}
          actionButton={() => (
            <ActionButton
              loading={isDeleting}
              variant="destructive"
              onClick={() => deleteBackup({ backupId: backup.id })}
              className="items-center"
              type="button"
            >
              <Trash2 className="size-4" />
              {t("settings.backups.list.actions.delete_backup")}
            </ActionButton>
          )}
        />
        <RowActionsMenu
          items={[
            ...(downloadUrl
              ? [
                  {
                    label: t("settings.backups.list.actions.download_backup"),
                    icon: <Download className="size-4" />,
                    href: downloadUrl,
                    download: true,
                  },
                ]
              : []),
            {
              label: t("settings.backups.list.actions.delete_backup"),
              icon: <Trash2 className="size-4" />,
              destructive: true,
              disabled: isDeleting,
              onSelect: () => setDeleteOpen(true),
            },
          ]}
        />
      </TableCell>
    </TableRow>
  );
}

function BackupsList() {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: backups, isLoading } = useQuery(
    api.backups.list.queryOptions(undefined, {
      refetchInterval: (query) => {
        const data = query.state.data;
        // Poll every 3 seconds if there's a pending backup, otherwise don't poll
        return data?.backups.some((backup) => backup.status === "pending")
          ? 3000
          : false;
      },
    }),
  );

  const { mutate: triggerBackup, isPending: isTriggering } = useMutation(
    api.backups.triggerBackup.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.backups.toasts.backup_queued"),
        });
        queryClient.invalidateQueries(api.backups.list.pathFilter());
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
    }),
  );

  const createBackupButton = (
    <ActionButton
      onClick={() => triggerBackup()}
      loading={isTriggering}
      variant="default"
      className="items-center"
    >
      <Play className="size-4" />
      {t("settings.backups.list.create_backup_now")}
    </ActionButton>
  );
  const isEmpty = backups?.backups.length === 0;

  return (
    <SettingsSection
      title={t("settings.backups.list.title")}
      description={
        <>
          {t("settings.backups.list.includes")}{" "}
          {t("settings.backups.list.description")}{" "}
          <Link
            href="/settings/import"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t("settings.import.import_export")}
          </Link>
          .
        </>
      }
      action={isEmpty ? undefined : createBackupButton}
    >
      {isLoading && <FullPageSpinner />}

      {isEmpty && (
        <Empty className="p-4 md:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DatabaseBackup />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {t("settings.backups.list.no_backups_title")}
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>{createBackupButton}</EmptyContent>
        </Empty>
      )}

      {backups && backups.backups.length > 0 && (
        <Table inCard className={stackedTable.table}>
          <TableHeader className={stackedTable.header}>
            <TableRow>
              <TableHead>
                {t("settings.backups.list.table.created_at")}
              </TableHead>
              <TableHead>
                {t("settings.backups.list.table.bookmarks")}
              </TableHead>
              <TableHead>{t("settings.backups.list.table.size")}</TableHead>
              <TableHead>{t("settings.backups.list.table.status")}</TableHead>
              <TableHead>
                <span className="sr-only">
                  {t("settings.backups.list.table.actions")}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={stackedTable.body}>
            {backups.backups.map((backup) => (
              <BackupRow key={backup.id} backup={backup} />
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsSection>
  );
}

export default function BackupSettings() {
  return (
    <>
      <BackupConfigurationForm />
      <BackupsList />
    </>
  );
}
