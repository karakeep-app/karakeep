"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

import { useSearchHistory } from "@karakeep/shared-react/hooks/search-history";

export default function Logout() {
  const router = useRouter();
  const { clearHistory } = useSearchHistory({
    getItem: (k: string) => localStorage.getItem(k),
    setItem: (k: string, v: string) => localStorage.setItem(k, v),
    removeItem: (k: string) => localStorage.removeItem(k),
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { error } = await authClient.signOut();
      if (!isMounted) {
        return;
      }
      if (error) {
        console.error("Failed to sign out", error);
      }
      clearHistory();
      router.push("/");
    })();

    return () => {
      isMounted = false;
    };
  }, [clearHistory, router]);

  return <span />;
}
