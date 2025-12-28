"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { CreditCard, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export default function SubscriptionSettings() {
  const { t } = useTranslation();
  const {
    data: subscriptionStatus,
    refetch,
    isLoading: isQueryLoading,
  } = api.subscriptions.getSubscriptionStatus.useQuery();

  const { data: subscriptionPrice } =
    api.subscriptions.getSubscriptionPrice.useQuery();

  const { mutate: syncStripeState } =
    api.subscriptions.syncWithStripe.useMutation({
      onSuccess: () => {
        refetch();
      },
    });
  const createCheckoutSession =
    api.subscriptions.createCheckoutSession.useMutation({
      onSuccess: (resp) => {
        if (resp.url) {
          window.location.href = resp.url;
        }
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    });
  const createPortalSession = api.subscriptions.createPortalSession.useMutation(
    {
      onSuccess: (resp) => {
        if (resp.url) {
          window.location.href = resp.url;
        }
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    },
  );

  const isLoading =
    createCheckoutSession.isPending || createPortalSession.isPending;

  useEffect(() => {
    syncStripeState();
  }, []);

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  const getStatusBadge = (status: "free" | "paid") => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="default" className="bg-green-500">
            {t("settings.subscription.paid")}
          </Badge>
        );
      case "free":
        return (
          <Badge variant="outline">{t("settings.subscription.free")}</Badge>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t("settings.subscription.subscription")}
        </CardTitle>
        <CardDescription>
          {t("settings.subscription.manage_subscription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isQueryLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <Skeleton className="h-10 w-32" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("settings.subscription.current_plan")}
                </label>
                <div className="flex items-center gap-2">
                  {subscriptionStatus?.tier &&
                    getStatusBadge(subscriptionStatus.tier)}
                </div>
              </div>

              {subscriptionStatus?.hasActiveSubscription && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("settings.subscription.billing_period")}
                    </label>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(subscriptionStatus.startDate)} -{" "}
                      {formatDate(subscriptionStatus.endDate)}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-4">
              {!subscriptionStatus?.hasActiveSubscription ? (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="flex items-center gap-2 font-semibold">
                          {t("settings.subscription.paid_plan")}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.subscription.unlock_bigger_quota")}
                        </p>
                        {subscriptionPrice && subscriptionPrice.amount ? (
                          <p className="mt-2 text-lg font-bold uppercase">
                            {subscriptionPrice.amount / 100}{" "}
                            {subscriptionPrice.currency}
                          </p>
                        ) : (
                          <Skeleton className="h-4 w-24" />
                        )}
                      </div>
                      <Button
                        onClick={() => createCheckoutSession.mutate()}
                        disabled={isLoading}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                      >
                        {isLoading && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t("settings.subscription.subscribe_now")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => createPortalSession.mutate()}
                      disabled={isLoading}
                      variant="outline"
                    >
                      {isLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t("settings.subscription.manage_billing")}
                    </Button>
                  </div>

                  {subscriptionStatus.cancelAtPeriodEnd && (
                    <Alert>
                      <AlertDescription>
                        {t("settings.subscription.subscription_canceled", {
                          date: formatDate(subscriptionStatus.endDate),
                        })}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
