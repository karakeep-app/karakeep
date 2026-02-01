"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Mail, X } from "lucide-react";

interface Invitation {
  id: string;
  role: string;
  list: {
    name: string;
    icon?: string;
    description?: string | null;
    owner?: {
      name?: string;
    } | null;
  };
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const acceptInvitation = useMutation(
    api.lists.acceptInvitation.mutationOptions({
      onSuccess: async () => {
        toast({
          description: t("lists.invitations.accepted"),
        });
        await Promise.all([
          queryClient.invalidateQueries(
            api.lists.getPendingInvitations.pathFilter(),
          ),
          queryClient.invalidateQueries(api.lists.list.pathFilter()),
        ]);
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          description: error.message || t("lists.invitations.failed_to_accept"),
        });
      },
    }),
  );

  const declineInvitation = useMutation(
    api.lists.declineInvitation.mutationOptions({
      onSuccess: async () => {
        toast({
          description: t("lists.invitations.declined"),
        });
        await queryClient.invalidateQueries(
          api.lists.getPendingInvitations.pathFilter(),
        );
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          description:
            error.message || t("lists.invitations.failed_to_decline"),
        });
      },
    }),
  );

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{invitation.list.name}</span>
          <span className="text-xs text-muted-foreground">
            {invitation.list.icon}
          </span>
        </div>
        {invitation.list.description && (
          <div className="mt-1 text-sm text-muted-foreground">
            {invitation.list.description}
          </div>
        )}
        <div className="mt-2 text-sm text-muted-foreground">
          {t("lists.invitations.invited_by")}{" "}
          <span className="font-medium">
            {invitation.list.owner?.name || "Unknown"}
          </span>
          {" • "}
          <span className="capitalize">{invitation.role}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            declineInvitation.mutate({ invitationId: invitation.id })
          }
          disabled={declineInvitation.isPending || acceptInvitation.isPending}
        >
          {declineInvitation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <X className="mr-1 h-4 w-4" />
              {t("lists.invitations.decline")}
            </>
          )}
        </Button>
        <Button
          size="sm"
          onClick={() =>
            acceptInvitation.mutate({ invitationId: invitation.id })
          }
          disabled={acceptInvitation.isPending || declineInvitation.isPending}
        >
          {acceptInvitation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="mr-1 h-4 w-4" />
              {t("lists.invitations.accept")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function PendingInvitationsCard() {
  const api = useTRPC();
  const { t } = useTranslation();

  const { data: invitations, isLoading } = useQuery(
    api.lists.getPendingInvitations.queryOptions(),
  );

  if (isLoading) {
    return null;
  }

  if (!invitations || invitations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-normal">
          <Mail className="h-5 w-5" />
          {t("lists.invitations.pending")}

          <span className="rounded bg-secondary p-1 text-sm text-secondary-foreground">
            {invitations.length}
          </span>
        </CardTitle>
        <CardDescription>{t("lists.invitations.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map((invitation) => (
          <InvitationRow key={invitation.id} invitation={invitation} />
        ))}
      </CardContent>
    </Card>
  );
}
