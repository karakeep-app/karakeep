import { useId, useState } from "react";

import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import {
  getBrowserSessionCredentials,
  getServerOrigin,
  requestBrowserSessionPermission,
} from "./utils/browserSession";
import usePluginSettings from "./utils/settings";

export default function BrowserSessionSettings() {
  const { settings, setSettings } = usePluginSettings();
  const id = useId();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const origin = getServerOrigin(settings.address);
  const enabled = getBrowserSessionCredentials(settings) === "include";

  const onToggle = async (checked: boolean) => {
    setError("");
    setPending(true);
    try {
      if (!checked) {
        await setSettings((s) => ({ ...s, browserSessionOrigin: undefined }));
        return;
      }
      const granted = await requestBrowserSessionPermission(settings.address);
      if (!granted) {
        setError(
          "Access to the server was not granted. Browser session remains off.",
        );
        return;
      }
      await setSettings((s) => ({ ...s, browserSessionOrigin: origin }));
    } catch {
      setError("Could not update the browser session. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          Use existing browser session
        </label>
        <Switch
          id={id}
          aria-describedby={`${id}-description`}
          checked={enabled}
          disabled={!origin || pending}
          onCheckedChange={onToggle}
        />
      </div>
      <p id={`${id}-description`} className="text-xs text-muted-foreground">
        For a sign-in service in front of Karakeep, such as Cloudflare Access.
        Sends this browser profile&apos;s cookies to your configured server.
        Your Karakeep login is still required. Server configuration may also be
        needed.
      </p>
      {enabled && (
        <Button
          variant="outline"
          onClick={() => chrome.tabs.create({ url: settings.address })}
        >
          Open server to sign in
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
