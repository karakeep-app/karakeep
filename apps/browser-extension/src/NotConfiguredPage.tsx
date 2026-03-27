import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import Logo from "./Logo";
import usePluginSettings from "./utils/settings";
import { isHttpUrl, normalizeServerAddress } from "./utils/url";

export default function NotConfiguredPage() {
  const navigate = useNavigate();

  const { settings, setSettings } = usePluginSettings();

  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [serverAddress, setServerAddress] = useState(settings.address);

  useEffect(() => {
    setServerAddress(settings.address);
  }, [settings.address]);

  // Clear warning when address changes
  useEffect(() => {
    setWarning("");
  }, [serverAddress]);

  const onSave = () => {
    const input = serverAddress.trim();
    if (input == "") {
      setError("Server address is required");
      return;
    }

    // Add URL protocol validation
    if (!isHttpUrl(input)) {
      setError("Server address must start with http:// or https://");
      return;
    }

    // Normalize the address by stripping /api/v1 or /api suffixes
    const normalizedAddress = normalizeServerAddress(input);

    // Show a warning if the address was normalized
    if (normalizedAddress !== input) {
      setWarning(
        `Address was automatically corrected from "${input}" to "${normalizedAddress}". ` +
          `The server address should be the base URL without /api/v1 or /api suffix.`,
      );
    }

    setSettings((s) => ({ ...s, address: normalizedAddress }));
    navigate("/signin");
  };

  return (
    <div className="flex flex-col space-y-2">
      <Logo />
      <span className="pt-3">
        To use the plugin, you need to configure it first.
      </span>
      <p className="text-red-500">{error}</p>
      {warning && (
        <p className="text-yellow-600 text-sm bg-yellow-50 p-2 rounded border border-yellow-200">
          {warning}
        </p>
      )}
      <div className="flex gap-2">
        <label className="my-auto">Server Address</label>
        <Input
          name="address"
          value={serverAddress}
          className="h-8 flex-1 rounded-lg border border-gray-300 p-2"
          onChange={(e) => setServerAddress(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Example: https://cloud.karakeep.app or http://localhost:3000
      </p>
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => navigate("/customheaders")}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Configure Custom Headers
          {settings.customHeaders &&
            Object.keys(settings.customHeaders).length > 0 &&
            ` (${Object.keys(settings.customHeaders).length})`}
        </button>
      </div>
      <Button onClick={onSave}>Configure</Button>
    </div>
  );
}