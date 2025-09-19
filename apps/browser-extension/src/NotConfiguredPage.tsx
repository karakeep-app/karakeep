import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import Logo from "./Logo";
import usePluginSettings from "./utils/settings";

export default function NotConfiguredPage() {
  const navigate = useNavigate();

  const { settings, setSettings } = usePluginSettings();

  const [error, setError] = useState("");
  const [serverAddress, setServerAddress] = useState(settings.address);
  useEffect(() => {
    setServerAddress(settings.address);
  }, [settings.address]);

  const onSave = () => {
    if (serverAddress == "") {
      setError("Server address is required");
      return;
    }

    // Add URL protocol validation
    if (
      !serverAddress.startsWith("http://") &&
      !serverAddress.startsWith("https://")
    ) {
      setError("Server address must start with http:// or https://");
      return;
    }

    setSettings((s) => ({ ...s, address: serverAddress.replace(/\/$/, "") }));
    navigate("/signin");
  };

  return (
    <div className="flex flex-col space-y-2">
      <Logo />
      <span className="pt-3">
        To use the plugin, you need to configure it first.
      </span>
      <p className="text-red-500">{error}</p>
      <div className="flex gap-2">
        <label className="my-auto">Server Address</label>
        <Input
          name="address"
          value={serverAddress}
          className="h-8 flex-1 rounded-lg border border-gray-300 p-2"
          onChange={(e) => setServerAddress(e.target.value)}
        />
      </div>
      <Button onClick={onSave}>Configure</Button>
    </div>
  );
}
