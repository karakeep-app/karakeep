"use client";

import React from "react";
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
      <h3 className="mb-4 text-lg font-medium">Backup Configuration</h3>
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
                  <FormLabel>Enable Automatic Backups</FormLabel>
                  <FormDescription>
                    Automatically create backups of your bookmarks
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
                <FormLabel>Backup Frequency</FormLabel>
                <FormControl>
                  <Select {...field}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormDescription>
                  How often backups should be created
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
                <FormLabel>Retention Period (days)</FormLabel>
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
                  How many days to keep backups before deleting them
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
            Save Settings
          </ActionButton>
        </form>
      </Form>
    </div>
  );
}

interface Backup {
  id: string;
  userId: string;
  assetId: string;
  createdAt: Date;
  size: number;
  bookmarkCount: number;
  status: "pending" | "success" | "failure";
  errorMessage?: string | null;
}

function BackupRow({ backup }: { backup: Backup }) {
  const apiUtils = api.useUtils();

  const { mutate: deleteBackup, isPending: isDeleting } =
    api.backups.delete.useMutation({
      onSuccess: () => {
        toast({
          description: "Backup has been deleted!",
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
      <TableCell>{backup.bookmarkCount.toLocaleString()}</TableCell>
      <TableCell>{formatSize(backup.size)}</TableCell>
      <TableCell>
        {backup.status === "success" ? (
          <span title="Successful" className="flex items-center gap-1">
            <CheckCircle className="size-4 text-green-600" />
            Success
          </span>
        ) : backup.status === "failure" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                title={backup.errorMessage || "Failed"}
                className="flex items-center gap-1"
              >
                <XCircle className="size-4 text-red-600" />
                Failed
              </span>
            </TooltipTrigger>
            <TooltipContent>{backup.errorMessage}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="flex items-center gap-1">
            <div className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            Pending
          </span>
        )}
      </TableCell>
      <TableCell className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              className="items-center"
              disabled={backup.status !== "success"}
            >
              <a
                href={getAssetUrl(backup.assetId)}
                download
                className={
                  backup.status !== "success"
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              >
                <Download className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download Backup</TooltipContent>
        </Tooltip>
        <ActionConfirmingDialog
          title="Delete Backup?"
          description="Are you sure you want to delete this backup? This action cannot be undone."
          actionButton={() => (
            <ActionButton
              loading={isDeleting}
              variant="destructive"
              onClick={() => deleteBackup({ backupId: backup.id })}
              className="items-center"
              type="button"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
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
  const apiUtils = api.useUtils();
  const { data: backups, isLoading } = api.backups.list.useQuery();

  const { mutate: triggerBackup, isPending: isTriggering } =
    api.backups.triggerBackup.useMutation({
      onSuccess: () => {
        toast({
          description:
            "Backup job has been queued! It will be processed shortly.",
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
          <span className="text-lg font-medium">Your Backups</span>
          <ActionButton
            onClick={() => triggerBackup()}
            loading={isTriggering}
            variant="default"
            className="items-center"
          >
            <Play className="mr-2 size-4" />
            Create Backup Now
          </ActionButton>
        </div>

        {isLoading && <FullPageSpinner />}

        {backups && backups.backups.length === 0 && (
          <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
            You don&apos;t have any backups yet. Enable automatic backups or
            create one manually.
          </p>
        )}

        {backups && backups.backups.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created At</TableHead>
                <TableHead>Bookmarks</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
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
