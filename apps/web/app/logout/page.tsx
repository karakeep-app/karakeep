"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

import { useSearchHistory } from "@karakeep/shared-react/hooks/search-history";

export default function Logout() {
  const router = useRouter();
  const { clearHistory } = useSearchHistory({
    getItem: (k: string) => localStorage.getItem(k),
    setItem: (k: string, v: string) => localStorage.setItem(k, v),
    removeItem: (k: string) => localStorage.removeItem(k),
  });
  useEffect(() => {
    signOut({
      redirect: false,
      callbackUrl: "/",
    }).then((d) => {
      clearHistory();
      router.push(d.url);
    });
  }, []);
  return <span />;
}
