"use client";

import React from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { useUserSettings } from "@/lib/userSettings";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle,
  Download,
  Play,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import { zBackupSchema } from "@karakeep/shared/types/backups";
import { zUpdateBackupSettingsSchema } from "@karakeep/shared/types/users";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

function BackupConfigurationForm() {
  const { t } = useTranslation();

  const settings = useUserSettings();
  const { mutate: updateSettings, isPending: isUpdating } =
    useUpdateUserSettings({
      onSuccess: () => {
        toast({
          description: t("settings.info.user_settings.user_settings_updated"),
        });
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    });

  const form = useForm<z.infer<typeof zUpdateBackupSettingsSchema>>({
    resolver: zodResolver(zUpdateBackupSettingsSchema),
    values: settings
      ? {
          backupsEnabled: settings.backupsEnabled,
          backupsFrequency: settings.backupsFrequency,
          backupsRetentionDays: settings.backupsRetentionDays,
        }
      : undefined,
  });

  return (
    <div className="rounded-md border bg-background p-4">
      <h3 className="mb-4 text-lg font-medium">
        {t("settings.backups.configuration.title")}
      </h3>
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((value) => {
            updateSettings(value);
          })}
        >
          <FormField
            control={form.control}
            name="backupsEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>
                    {t(
                      "settings.backups.configuration.enable_automatic_backups",
                    )}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      "settings.backups.configuration.enable_automatic_backups_description",
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="backupsFrequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("settings.backups.configuration.backup_frequency")}
                </FormLabel>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    {...field}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t(
                          "settings.backups.configuration.select_frequency",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">
                        {t("settings.backups.configuration.frequency.daily")}
                      </SelectItem>
                      <SelectItem value="weekly">
                        {t("settings.backups.configuration.frequency.weekly")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormDescription>
                  {t(
                    "settings.backups.configuration.backup_frequency_description",
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="backupsRetentionDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("settings.backups.configuration.retention_period")}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    "settings.backups.configuration.retention_period_description",
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <ActionButton
            type="submit"
            loading={isUpdating}
            className="items-center"
          >
            <Save className="mr-2 size-4" />
            {t("settings.backups.configuration.save_settings")}
          </ActionButton>
        </form>
      </Form>
    </div>
  );
}

function BackupRow({ backup }: { backup: z.infer<typeof zBackupSchema> }) {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();

  const { mutate: deleteBackup, isPending: isDeleting } =
    api.backups.delete.useMutation({
      onSuccess: () => {
        toast({
          description: t("settings.backups.toasts.backup_deleted"),
        });
        apiUtils.backups.list.invalidate();
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
    });

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <TableRow>
      <TableCell>{backup.createdAt.toLocaleString()}</TableCell>
      <TableCell>
        {backup.status === "pending"
          ? "-"
          : backup.bookmarkCount.toLocaleString()}
      </TableCell>
      <TableCell>
        {backup.status === "pending" ? "-" : formatSize(backup.size)}
      </TableCell>
      <TableCell>
        {backup.status === "success" ? (
          <span
            title={t("settings.backups.list.status.success")}
            className="flex items-center gap-1"
          >
            <CheckCircle className="size-4 text-green-600" />
            {t("settings.backups.list.status.success")}
          </span>
        ) : backup.status === "failure" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                title={
                  backup.errorMessage ||
                  t("settings.backups.list.status.failed")
                }
                className="flex items-center gap-1"
              >
                <XCircle className="size-4 text-red-600" />
                {t("settings.backups.list.status.failed")}
              </span>
            </TooltipTrigger>
            <TooltipContent>{backup.errorMessage}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="flex items-center gap-1">
            <div className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            {t("settings.backups.list.status.pending")}
          </span>
        )}
      </TableCell>
      <TableCell className="flex items-center gap-2">
        {backup.assetId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                className="items-center"
                disabled={backup.status !== "success"}
              >
                <Link
                  href={getAssetUrl(backup.assetId)}
                  download
                  prefetch={false}
                  className={
                    backup.status !== "success"
                      ? "pointer-events-none opacity-50"
                      : ""
                  }
                >
                  <Download className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("settings.backups.list.actions.download_backup")}
            </TooltipContent>
          </Tooltip>
        )}
        <ActionConfirmingDialog
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
              <Trash2 className="mr-2 size-4" />
              {t("settings.backups.list.actions.delete_backup")}
            </ActionButton>
          )}
        >
          <Button variant="ghost" disabled={isDeleting}>
            <Trash2 className="size-4" />
          </Button>
        </ActionConfirmingDialog>
      </TableCell>
    </TableRow>
  );
}

function BackupsList() {
  const { t } = useTranslation();
  const apiUtils = api.useUtils();
  const { data: backups, isLoading } = api.backups.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 3 seconds if there's a pending backup, otherwise don't poll
      return data?.backups.some((backup) => backup.status === "pending")
        ? 3000
        : false;
    },
  });

  const { mutate: triggerBackup, isPending: isTriggering } =
    api.backups.triggerBackup.useMutation({
      onSuccess: () => {
        toast({
          description: t("settings.backups.toasts.backup_queued"),
        });
        apiUtils.backups.list.invalidate();
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
    });

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium">
            {t("settings.backups.list.title")}
          </span>
          <ActionButton
            onClick={() => triggerBackup()}
            loading={isTriggering}
            variant="default"
            className="items-center"
          >
            <Play className="mr-2 size-4" />
            {t("settings.backups.list.create_backup_now")}
          </ActionButton>
        </div>

        {isLoading && <FullPageSpinner />}

        {backups && backups.backups.length === 0 && (
          <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
            {t("settings.backups.list.no_backups")}
          </p>
        )}

        {backups && backups.backups.length > 0 && (
          <Table>
            <TableHeader>
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
                  {t("settings.backups.list.table.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.backups.map((backup) => (
                <BackupRow key={backup.id} backup={backup} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default function BackupSettings() {
  return (
    <div className="space-y-6">
      <BackupConfigurationForm />
      <BackupsList />
    </div>
  );
}
