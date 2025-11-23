"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg bg-slate-50 p-8 shadow-sm dark:bg-slate-700/50 dark:shadow-md">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Not Found Icon */}
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-4">
          <h1 className="text-balance text-2xl font-semibold text-foreground">
            Page Not Found
          </h1>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            We couldn&apos;t find the page you&apos;re looking for. It may have
            been moved or doesn&apos;t exist.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button className="w-full" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
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
