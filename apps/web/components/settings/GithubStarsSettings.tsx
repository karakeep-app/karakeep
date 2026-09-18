"use client";

import { useTranslation } from "@/lib/i18n/client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FullPageSpinner } from "../ui/full-page-spinner";
import { SettingsPage, SettingsSection } from "./SettingsPage";

export default function GithubStarsSettings() {
  const { t } = useTranslation();
  const api = useTRPC();
  const cache = useQueryClient();
  const subscription = useQuery(
    api.githubStars.get.queryOptions(undefined, { refetchInterval: 10_000 }),
  );
  const lists = useQuery(api.lists.list.queryOptions());
  const [error, setError] = useState<string | null>(null);
  const onSuccess = async () => {
    setError(null);
    await cache.invalidateQueries(api.githubStars.get.pathFilter());
  };
  const onError = (error: { message: string }) => setError(error.message);
  const save = useMutation(
    api.githubStars.save.mutationOptions({ onSuccess, onError }),
  );
  const sync = useMutation(
    api.githubStars.syncNow.mutationOptions({ onSuccess, onError }),
  );
  const disconnect = useMutation(
    api.githubStars.disconnect.mutationOptions({ onSuccess, onError }),
  );
  if (subscription.isPending || lists.isPending) return <FullPageSpinner />;
  if (subscription.error || lists.error)
    return <p role="alert">{t("settings.github_stars.load_error")}</p>;
  const current = subscription.data;
  const destinations =
    lists.data?.lists.filter(
      (list) => list.type === "manual" && list.userRole === "owner",
    ) ?? [];
  const busy = save.isPending || sync.isPending || disconnect.isPending;
  const running =
    current?.leaseUntil && new Date(current.leaseUntil) > new Date();
  return (
    <SettingsPage
      title={t("settings.github_stars.title")}
      description={t("settings.github_stars.description")}
    >
      <SettingsSection
        title={t("settings.github_stars.account")}
        description={t("settings.github_stars.account_description")}
      >
        <form
          key={current?.id ?? "new"}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            save.mutate({
              username: String(data.get("username")),
              listId: String(data.get("listId")),
              enabled: data.has("enabled"),
              recurring: data.get("mode") === "recurring",
              importTopics: data.has("importTopics"),
            });
          }}
        >
          <div className="space-y-2">
            <label htmlFor="github-username">
              {t("settings.github_stars.username")}
            </label>
            <Input
              id="github-username"
              name="username"
              aria-describedby="github-username-help"
              defaultValue={current?.username ?? ""}
              required
              maxLength={39}
              placeholder="octocat"
              autoComplete="off"
            />
            <p
              id="github-username-help"
              className="text-sm text-muted-foreground"
            >
              {t("settings.github_stars.username_help")}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="github-list">
              {t("settings.github_stars.destination")}
            </label>
            <select
              id="github-list"
              name="listId"
              aria-describedby="github-list-help"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
              defaultValue={current?.listId ?? ""}
            >
              <option value="" disabled>
                {t("settings.github_stars.choose_list")}
              </option>
              {destinations.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <p id="github-list-help" className="text-sm text-muted-foreground">
              {t("settings.github_stars.destination_help")}
            </p>
            {destinations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("settings.github_stars.create_list")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="github-mode">
              {t("settings.github_stars.mode")}
            </label>
            <select
              id="github-mode"
              name="mode"
              defaultValue={current?.recurring === false ? "once" : "recurring"}
              aria-describedby="github-mode-help"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="once">{t("settings.github_stars.once")}</option>
              <option value="recurring">
                {t("settings.github_stars.recurring")}
              </option>
            </select>
            <p id="github-mode-help" className="text-sm text-muted-foreground">
              {t("settings.github_stars.mode_help")}
            </p>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="enabled"
              aria-describedby="github-enabled-help"
              defaultChecked={current?.enabled ?? true}
            />
            {t("settings.github_stars.enabled")}
          </label>
          <p id="github-enabled-help" className="text-sm text-muted-foreground">
            {t("settings.github_stars.enabled_help")}
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="importTopics"
              aria-describedby="github-topics-help"
              defaultChecked={current?.importTopics ?? false}
            />
            {t("settings.github_stars.topics")}
          </label>
          <p id="github-topics-help" className="text-sm text-muted-foreground">
            {t("settings.github_stars.topics_help")}
          </p>
          <Button
            type="submit"
            disabled={busy || !!running || destinations.length === 0}
          >
            {save.isPending
              ? t("settings.github_stars.saving")
              : t("settings.github_stars.save")}
          </Button>
        </form>
        {running && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("settings.github_stars.running_help")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </SettingsSection>
      {current && (
        <SettingsSection title={t("settings.github_stars.synchronization")}>
          <div role="status" className="space-y-2 text-sm">
            <p>
              {!current.enabled
                ? !current.recurring && current.lastSuccessfulSyncAt
                  ? t("settings.github_stars.completed")
                  : t("settings.github_stars.paused")
                : running
                  ? t("settings.github_stars.importing")
                  : current.lastError
                    ? t("settings.github_stars.waiting")
                    : current.nextRunAt <= new Date()
                      ? t("settings.github_stars.queued")
                      : current.nextPage > 1
                        ? t("settings.github_stars.progress")
                        : t("settings.github_stars.ready")}
            </p>
            <p>
              {t("settings.github_stars.last_sync")}{" "}
              {current.lastSuccessfulSyncAt
                ? new Date(current.lastSuccessfulSyncAt).toLocaleString()
                : t("settings.github_stars.never")}
            </p>
            {current.enabled && (
              <p>
                {t("settings.github_stars.next_check")}{" "}
                {new Date(current.nextRunAt).toLocaleString()}
              </p>
            )}
            {current.lastError && <p role="alert">{current.lastError}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !!running || !current.enabled}
              onClick={() => sync.mutate()}
            >
              {t("settings.github_stars.sync_now")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !!running}
              aria-describedby="github-disconnect-help"
              onClick={() => disconnect.mutate()}
            >
              {t("settings.github_stars.disconnect")}
            </Button>
            <Link
              className="inline-flex items-center underline"
              href={`/dashboard/lists/${current.listId}`}
            >
              {t("settings.github_stars.view")}
            </Link>
          </div>
          <p
            id="github-disconnect-help"
            className="text-sm text-muted-foreground"
          >
            {t("settings.github_stars.disconnect_help")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("settings.github_stars.retry_help")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("settings.github_stars.empty_help")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("settings.github_stars.preservation")}
          </p>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
