"use client";

import { api } from "@/lib/trpc";

export function InvitationNotificationBadge() {
  const { data: pendingInvitations } = api.lists.getPendingInvitations.useQuery(
    undefined,
    {
      refetchInterval: 1000 * 60 * 5,
    },
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
