"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc";

/**
 * This component is used to address a confusion when the JWT token exists but the user no longer exists in the database.
 * So this component synchronusly checks if the user is still valid and if not, signs out the user.
 */
export default function ValidAccountCheck() {
  const router = useRouter();
  const { error } = api.users.whoami.useQuery(undefined, {
    retry: (_failureCount, error) => {
      if (error.data?.code === "UNAUTHORIZED") {
        return false;
      }
      return true;
    },
  });
  useEffect(() => {
    if (error?.data?.code === "UNAUTHORIZED") {
      router.push("/logout");
    }
  }, [error]);

  return <></>;
}
