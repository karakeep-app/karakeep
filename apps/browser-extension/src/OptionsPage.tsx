import React, { useEffect } from "react";
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
import { api } from "./utils/trpc";

export default function OptionsPage() {
  const navigate = useNavigate();
  const { settings, setSettings } = usePluginSettings();
  const { setTheme, theme } = useTheme();

  const { data: whoami, error: whoAmIError } = api.users.whoami.useQuery(
    undefined,
    {
      enabled: settings.address != "",
    },
  );

  const { mutate: deleteKey } = api.apiKeys.revoke.useMutation();

  const invalidateWhoami = api.useUtils().users.whoami.refetch;

  useEffect(() => {
    invalidateWhoami();
  }, [settings, invalidateWhoami]);

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
