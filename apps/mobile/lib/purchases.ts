import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { useClientConfig } from "./client-config";

// RevenueCat public SDK keys. These are only set for official builds, so
// purchases are never offered in builds that can't process them.
const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
});

async function identifyPurchasesUser(apiKey: string, userId: string) {
  // The Karakeep user ID is the RevenueCat app user ID, which is how the
  // server links purchases to accounts.
  if (!(await Purchases.isConfigured())) {
    Purchases.configure({ apiKey, appUserID: userId });
  } else if ((await Purchases.getAppUserID()) !== userId) {
    await Purchases.logIn(userId);
  }
}

export async function resetPurchasesUser() {
  try {
    if (!(await Purchases.isConfigured())) {
      return;
    }
    if (!(await Purchases.isAnonymous())) {
      await Purchases.logOut();
    }
  } catch (error) {
    console.warn("Failed to log out of RevenueCat", error);
  }
}

/**
 * In-app purchases are available when this build ships a RevenueCat key and
 * the connected server is set up to receive them (i.e. the hosted service)
 * and has enabled purchases for this platform. Self-hosted servers never get
 * purchase options.
 */
export function useInAppPurchases() {
  const api = useTRPC();
  const config = useClientConfig();
  const isSupported =
    !!REVENUECAT_API_KEY &&
    config.revenueCat.isConfigured &&
    config.revenueCat.purchasePlatforms.some((p) => p === Platform.OS);
  const { data: user } = useQuery({
    ...api.users.whoami.queryOptions(),
    enabled: isSupported,
  });
  const userId = user?.id;
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupported || !REVENUECAT_API_KEY || !userId) {
      return;
    }
    let cancelled = false;
    identifyPurchasesUser(REVENUECAT_API_KEY, userId)
      .then(() => {
        if (!cancelled) {
          setReadyUserId(userId);
        }
      })
      .catch((error) => {
        console.warn("Failed to set up in-app purchases", error);
      });
    return () => {
      cancelled = true;
    };
  }, [isSupported, userId]);

  return {
    isAvailable: isSupported && !!userId && readyUserId === userId,
  };
}
