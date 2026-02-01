"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useTRPC } from "@/lib/trpc";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { AdminCard } from "./AdminCard";

interface AdminNotice {
  level: "info" | "warning" | "error";
  message: React.ReactNode;
  title: string;
}

function useAdminNotices() {
  const api = useTRPC();
  const { data } = useQuery(api.admin.getAdminNoticies.queryOptions());
  if (!data) {
    return [];
  }
  const ret: AdminNotice[] = [];
  return ret;
}

export function AdminNotices() {
  const notices = useAdminNotices();

  if (notices.length === 0) {
    return null;
  }
  return (
    <AdminCard>
      <div className="flex flex-col gap-2">
        {notices.map((n, i) => (
          <Alert key={i} variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{n.title}</AlertTitle>
            <AlertDescription>{n.message}</AlertDescription>
          </Alert>
        ))}
      </div>
    </AdminCard>
  );
}

export function AdminNoticeBadge() {
  const notices = useAdminNotices();
  if (notices.length === 0) {
    return null;
  }
  return <Badge variant="destructive">{notices.length}</Badge>;
}
