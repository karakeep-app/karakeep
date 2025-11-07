import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router";

import { DEMO_LINK, DOCS_LINK, GITHUB_LINK } from "./constants";
import Logo from "/icons/karakeep-full.svg?url";

export default function NavBar() {
  return (
    <div className="flex justify-between px-3 py-4">
      <Link to="/">
        <img src={Logo} alt="logo" className="w-36" />
      </Link>

      {/* Mobile navigation - show essential buttons */}
      <div className="flex items-center gap-2 sm:hidden">
        <Link
          to="/pricing"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Pricing
        </Link>
        <a
          href="https://cloud.karakeep.app"
          target="_blank"
          className={cn(
            "px-3 py-1.5 text-xs",
            buttonVariants({ variant: "outline", size: "sm" }),
          )}
          rel="noreferrer"
        >
          Login
        </a>
      </div>

      {/* Desktop navigation - show all items */}
      <div className="hidden items-center gap-6 sm:flex">
        <Link to="/pricing" className="flex justify-center gap-2 text-center">
          Pricing
        </Link>
        <a
          href={DOCS_LINK}
          target="_blank"
          className="flex justify-center gap-2 text-center"
          rel="noreferrer"
        >
          Docs
        </a>
        <a
          href={GITHUB_LINK}
          target="_blank"
          className="flex justify-center gap-2 text-center"
          rel="noreferrer"
        >
          GitHub
        </a>
        <a
          href="https://cloud.karakeep.app"
          target="_blank"
          className={cn(
            "text flex h-full w-20 gap-2",
            buttonVariants({ variant: "outline" }),
          )}
          rel="noreferrer"
        >
          Login
        </a>
        <a
          href={DEMO_LINK}
          target="_blank"
          className={cn(
            "text flex h-full w-28 gap-2",
            buttonVariants({ variant: "default" }),
          )}
          rel="noreferrer"
        >
          Try Demo
        </a>
      </div>
    </div>
  );
}
