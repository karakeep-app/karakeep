"use client";

import { useTRPC } from "@/lib/trpc";
import { useQuery } from "@tanstack/react-query";

export function InvitationNotificationBadge() {
  const api = useTRPC();
  const { data: pendingInvitations } = useQuery(
    api.lists.getPendingInvitations.queryOptions(undefined, {
      refetchInterval: 1000 * 60 * 5,
    }),
  );
  const pendingInvitationsCount = pendingInvitations?.length ?? 0;

  if (pendingInvitationsCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center px-1">
      <span className="rounded-full bg-blue-500 px-2 py-0.5 text-center text-xs text-white">
        {pendingInvitationsCount}
      </span>
    </div>
  );
}
