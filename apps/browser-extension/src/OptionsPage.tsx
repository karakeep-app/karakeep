import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, LogOut, Moon, Sun, SunMoon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { PopupHeader } from "./components/PopupHeader";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import Spinner from "./Spinner";
import {
  hasHostPermission,
  removeHostPermission,
  requestHostPermission,
} from "./utils/permissions";
import usePluginSettings, {
  DEFAULT_BADGE_CACHE_EXPIRE_MS,
} from "./utils/settings";
import { cn } from "./utils/css";
import { useTheme } from "./utils/ThemeProvider";
import { useTRPC } from "./utils/trpc";

const THEME_OPTIONS = [
  { value: "light", icon: Sun, label: "Light mode" },
  { value: "dark", icon: Moon, label: "Dark mode" },
  { value: "system", icon: Laptop, label: "System mode" },
] as const;

export default function OptionsPage() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, setSettings } = usePluginSettings();
  const { setTheme, theme } = useTheme();

  // `<all_urls>` is an optional host permission that the user grants when they
  // opt in to client-side crawling. Keep the switch in sync with whether it's
  // actually granted (it can be revoked from the browser's extension settings).
  const [hostPermissionGranted, setHostPermissionGranted] = useState(false);
  useEffect(() => {
    let cancelled = false;
    hasHostPermission().then((granted) => {
      if (!cancelled) setHostPermissionGranted(granted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clientSideCrawlingEnabled =
    settings.useSingleFile && hostPermissionGranted;

  const onToggleClientSideCrawling = async (checked: boolean) => {
    if (checked) {
      // Must run synchronously off the user gesture — don't await anything else
      // before requesting the permission.
      const granted = await requestHostPermission();
      if (!granted) {
        return;
      }
      setHostPermissionGranted(true);
      await setSettings((s) => ({ ...s, useSingleFile: true }));
    } else {
      await setSettings((s) => ({ ...s, useSingleFile: false }));
      await removeHostPermission();
      setHostPermissionGranted(false);
    }
  };

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

  let accountLabel: React.ReactNode;
  if (whoAmIError) {
    if (whoAmIError.data?.code == "UNAUTHORIZED") {
      accountLabel = "Not signed in";
    } else {
      accountLabel = (
        <span className="text-destructive">
          Something went wrong: {whoAmIError.message}
        </span>
      );
    }
  } else if (whoami) {
    accountLabel = whoami.email;
  } else {
    accountLabel = <Spinner className="size-4 text-muted-foreground" />;
  }

  // Opened from the popup's header: return to that screen. Going to "/" would
  // re-run the save flow for the active tab. Otherwise (e.g. right after
  // sign-in) "/" is where the user wants to go next.
  const onBack = () => {
    if ((location.state as { canGoBack?: boolean } | null)?.canGoBack) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const onLogout = () => {
    if (settings.apiKeyId) {
      deleteKey({ id: settings.apiKeyId });
    }
    setSettings((s) => ({ ...s, apiKey: "", apiKeyId: undefined }));
    invalidateWhoami();
    navigate("/signin");
  };

  return (
    <div className="flex flex-col gap-5">
      <PopupHeader
        title="Settings"
        onBack={location.key !== "default" ? onBack : undefined}
      />

      <SettingsSection title="Account">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase">
            {whoami?.email?.[0] ?? "?"}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{accountLabel}</span>
            <span className="truncate text-xs text-muted-foreground">
              {settings.address}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5"
            onClick={onLogout}
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Saving">
        <SettingsRow
          label="Auto-save on open"
          description="Save the page as soon as you open the extension. When off, you'll confirm first."
        >
          <Switch
            checked={settings.autoSave}
            onCheckedChange={(checked) =>
              setSettings((s) => ({ ...s, autoSave: checked }))
            }
          />
        </SettingsRow>
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              Client-side crawling
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                Experimental
              </span>
            </span>
          }
          description="Capture the page in your browser, exactly as you see it. Slower, and needs permission to read pages you save."
        >
          <Switch
            checked={clientSideCrawlingEnabled}
            onCheckedChange={onToggleClientSideCrawling}
          />
        </SettingsRow>
        {clientSideCrawlingEnabled && (
          <SettingsRow
            label="Include images"
            description="Makes the upload slower."
            inset
          >
            <Switch
              checked={settings.singleFileIncludeImages}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, singleFileIncludeImages: checked }))
              }
            />
          </SettingsRow>
        )}
      </SettingsSection>

      <SettingsSection title="Toolbar badge">
        <SettingsRow
          label="Show badge on saved pages"
          description="Mark the toolbar icon when the current page is already saved."
        >
          <Switch
            checked={settings.showCountBadge}
            onCheckedChange={(checked) =>
              setSettings((s) => ({ ...s, showCountBadge: checked }))
            }
          />
        </SettingsRow>
        {settings.showCountBadge && (
          <SettingsRow
            label="Cache badge status"
            description="Fewer requests to your server, but the badge can be stale."
          >
            <Switch
              checked={settings.useBadgeCache}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, useBadgeCache: checked }))
              }
            />
          </SettingsRow>
        )}
        {settings.showCountBadge && settings.useBadgeCache && (
          <SettingsRow label="Cache duration" inset>
            <div className="flex items-center gap-2">
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
                className="h-8 w-20 text-right"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          </SettingsRow>
        )}
      </SettingsSection>

      <SettingsSection title="Appearance">
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              <SunMoon className="size-4 text-muted-foreground" />
              Theme
            </span>
          }
        >
          <div
            role="group"
            aria-label="Theme"
            className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
          >
            {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
              <Button
                key={value}
                variant="ghost"
                className={cn(
                  "h-auto rounded px-2 py-1 text-muted-foreground focus:bg-background/60",
                  theme === value &&
                    "bg-background text-foreground shadow-sm hover:bg-background focus:bg-background",
                )}
                aria-pressed={theme === value}
                aria-label={label}
                title={label}
                onClick={() => setTheme(value)}
              >
                <Icon className="size-3.5" />
              </Button>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-col divide-y rounded-lg border bg-card">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  description,
  inset,
  children,
}: {
  label: React.ReactNode;
  description?: string;
  inset?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-3 py-2.5",
        inset && "bg-muted/40 pl-6",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
