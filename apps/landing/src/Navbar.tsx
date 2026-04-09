import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

import { CLOUD_SIGNUP_LINK, DOCS_LINK, GITHUB_LINK } from "./constants";
import Logo from "/icons/karakeep-full.svg?url";

export default function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200/50 bg-white/70 backdrop-blur-xl">
      <div className="container flex items-center justify-between px-4 py-3">
        <a href="/">
          <img src={Logo} alt="logo" className="w-36" />
        </a>

        {/* Desktop navigation */}
        <div className="hidden items-center gap-6 md:flex">
          <a
            href="/pricing"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            Pricing
          </a>
          <a
            href={DOCS_LINK}
            target="_blank"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
            rel="noreferrer"
          >
            Docs
          </a>
          <a
            href={GITHUB_LINK}
            target="_blank"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
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
            href={CLOUD_SIGNUP_LINK}
            target="_blank"
            className={cn(
              "text flex h-full w-32 gap-2",
              buttonVariants({ variant: "default" }),
            )}
            rel="noreferrer"
          >
            Get Started
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="size-6 text-gray-700" />
          ) : (
            <Menu className="size-6 text-gray-700" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-gray-200/50 bg-white/95 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-3">
            <a
              href="/pricing"
              className="text-sm text-gray-600 hover:text-gray-900"
              onClick={() => setMobileOpen(false)}
            >
              Pricing
            </a>
            <a
              href={DOCS_LINK}
              target="_blank"
              className="text-sm text-gray-600 hover:text-gray-900"
              rel="noreferrer"
            >
              Docs
            </a>
            <a
              href={GITHUB_LINK}
              target="_blank"
              className="text-sm text-gray-600 hover:text-gray-900"
              rel="noreferrer"
            >
              GitHub
            </a>
            <div className="mt-2 flex gap-3">
              <a
                href="https://cloud.karakeep.app"
                target="_blank"
                className={cn(
                  "flex-1",
                  buttonVariants({ variant: "outline", size: "sm" }),
                )}
                rel="noreferrer"
              >
                Login
              </a>
              <a
                href={CLOUD_SIGNUP_LINK}
                target="_blank"
                className={cn(
                  "flex-1",
                  buttonVariants({ variant: "default", size: "sm" }),
                )}
                rel="noreferrer"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
