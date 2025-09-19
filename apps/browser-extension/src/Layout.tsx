import { Home, RefreshCw, Settings, X } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import usePluginSettings from "./utils/settings";

export default function Layout() {
  const navigate = useNavigate();
  const { settings, isPending: isInit } = usePluginSettings();
  if (!isInit) {
    return <div className="p-4">Loading ... </div>;
  }

  if (!settings.apiKey || !settings.address) {
    navigate("/notconfigured");
    return;
  }

  return (
    <div className="flex flex-col space-y-2">
      <div className="rounded-md bg-gray-100 p-4 dark:bg-gray-900">
        <Outlet />
      </div>
      <hr />
      <div className="flex justify-between space-x-3">
        <div className="my-auto">
          <a
            className="flex gap-2 text-foreground"
            target="_blank"
            rel="noreferrer"
            href={`${settings.address}/dashboard/bookmarks`}
          >
            <Home />
            <span className="text-md my-auto">Bookmarks</span>
          </a>
        </div>
        <div className="flex space-x-3">
          {process.env.NODE_ENV == "development" && (
            <Button onClick={() => navigate(0)}>
              <RefreshCw className="w-4" />
            </Button>
          )}
          <Button onClick={() => navigate("/options")}>
            <Settings className="w-4" />
          </Button>
          <Button onClick={() => window.close()}>
            <X className="w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
