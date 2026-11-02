import { House, RefreshCw, Settings, X } from "lucide-react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";

import { HeaderIconButton, PopupHeader } from "./components/PopupHeader";
import { buttonVariants } from "./components/ui/button";
import Spinner from "./Spinner";
import { cn } from "./utils/css";
import usePluginSettings from "./utils/settings";

export default function Layout() {
  const navigate = useNavigate();
  const { settings, isPending: isInit } = usePluginSettings();

  if (!isInit) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (!settings.apiKey || !settings.address) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PopupHeader>
        <a
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "size-8 text-muted-foreground hover:text-foreground",
          )}
          target="_blank"
          rel="noreferrer"
          href={`${settings.address}/dashboard/bookmarks`}
          aria-label="Open Karakeep"
          title="Open Karakeep"
        >
          <House className="size-4" />
        </a>
        {process.env.NODE_ENV == "development" && (
          <HeaderIconButton label="Reload" onClick={() => navigate(0)}>
            <RefreshCw className="size-4" />
          </HeaderIconButton>
        )}
        <HeaderIconButton
          label="Settings"
          onClick={() => navigate("/options", { state: { canGoBack: true } })}
        >
          <Settings className="size-4" />
        </HeaderIconButton>
        <HeaderIconButton label="Close" onClick={() => window.close()}>
          <X className="size-4" />
        </HeaderIconButton>
      </PopupHeader>
      <Outlet />
    </div>
  );
}
