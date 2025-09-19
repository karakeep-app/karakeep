"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function Error() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg bg-slate-50 p-8 shadow-sm dark:bg-slate-700/50 dark:shadow-md">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-4">
          <h1 className="text-balance text-2xl font-semibold text-foreground">
            Oops! Something went wrong
          </h1>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            We&apos;re sorry, but an unexpected error occurred. Please try again
            or contact support if the issue persists.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button className="w-full" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>

          <Link href="/" className="block">
            <Button variant="outline" className="w-full">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
