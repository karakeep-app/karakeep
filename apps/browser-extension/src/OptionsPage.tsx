import React, { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Switch } from "./components/ui/switch";
import Logo from "./Logo";
import Spinner from "./Spinner";
import usePluginSettings, {
  DEFAULT_BADGE_CACHE_EXPIRE_MS,
} from "./utils/settings";
import { useTheme } from "./utils/ThemeProvider";
import { useTRPC } from "./utils/trpc";

export default function OptionsPage() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { settings, setSettings } = usePluginSettings();
  const { setTheme, theme } = useTheme();

  const { data: whoami, error: whoAmIError } = useQuery(
    api.users.whoami.queryOptions(undefined, {
      enabled: settings.address != "",
    }),
  );

  const { mutate: deleteKey } = useMutation(
    api.apiKeys.revoke.mutationOptions(),
  );

  const invalidateWhoami = () => {
    queryClient.refetchQueries(api.users.whoami.queryFilter());
  };

  useEffect(() => {
    invalidateWhoami();
  }, [settings]);

  let loggedInMessage: React.ReactNode;
  if (whoAmIError) {
    if (whoAmIError.data?.code == "UNAUTHORIZED") {
      loggedInMessage = <span>Not logged in</span>;
    } else {
      loggedInMessage = (
        <span>Something went wrong: {whoAmIError.message}</span>
      );
    }
  } else if (whoami) {
    loggedInMessage = <span>{whoami.email}</span>;
  } else {
    loggedInMessage = <Spinner />;
  }

  const onLogout = () => {
    if (settings.apiKeyId) {
      deleteKey({ id: settings.apiKeyId });
    }
    setSettings((s) => ({ ...s, apiKey: "", apiKeyId: undefined }));
    invalidateWhoami();
    navigate("/notconfigured");
  };

  return (
    <div className="flex flex-col space-y-2">
      <Logo />
      <span className="text-lg">Settings</span>
      <hr />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Show count badge</span>
        <Switch
          checked={settings.showCountBadge}
          onCheckedChange={(checked) =>
            setSettings((s) => ({ ...s, showCountBadge: checked }))
          }
        />
      </div>
      {settings.showCountBadge && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Use badge cache</span>
            <Switch
              checked={settings.useBadgeCache}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, useBadgeCache: checked }))
              }
            />
          </div>
          {settings.useBadgeCache && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  Badge cache expire time (second)
                </span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={settings.badgeCacheExpireMs / 1000}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      badgeCacheExpireMs:
                        parseInt(e.target.value) * 1000 ||
                        DEFAULT_BADGE_CACHE_EXPIRE_MS,
                    }))
                  }
                  className="w-32"
                />
              </div>
            </>
          )}
        </>
      )}
      <hr />
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Client-side crawling</span>
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
              Experimental
            </span>
          </div>
          <span className="text-xs text-gray-500">
            Captures the page in the browser instead of on the server. Slower,
            but captures the page more accurately as you see it.
          </span>
        </div>
        <Switch
          checked={settings.useSingleFile}
          onCheckedChange={(checked) =>
            setSettings((s) => ({ ...s, useSingleFile: checked }))
          }
        />
      </div>
      {settings.useSingleFile && (
        <div className="flex items-start justify-between gap-2 pl-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Include images</span>
            <span className="text-xs text-gray-500">
              Including images makes the upload slower.
            </span>
          </div>
          <Switch
            checked={settings.singleFileIncludeImages}
            onCheckedChange={(checked) =>
              setSettings((s) => ({ ...s, singleFileIncludeImages: checked }))
            }
          />
        </div>
      )}
      <hr />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Auto-save on open</span>
        <Switch
          checked={settings.autoSave}
          onCheckedChange={(checked) =>
            setSettings((s) => ({ ...s, autoSave: checked }))
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        When disabled, you&apos;ll confirm before saving bookmarks.
      </p>
      <hr />
      <div className="flex gap-2">
        <span className="my-auto">Server Address:</span>
        {settings.address}
      </div>
      <div className="flex gap-2">
        <span className="my-auto">Logged in as:</span>
        {loggedInMessage}
      </div>
      <div className="flex gap-2">
        <span className="my-auto">Theme:</span>
        <Select value={theme} onValueChange={setTheme}>
          <SelectTrigger className="w-24">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={onLogout}>Logout</Button>
    </div>
  );
}
