"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * This component is used to address a confusion when the JWT token exists but the user no longer exists in the database.
 * So this component synchronusly checks if the user is still valid and if not, signs out the user.
 */
export default function ValidAccountCheck() {
  const api = useTRPC();
  const router = useRouter();
  const { error } = useQuery(
    api.users.whoami.queryOptions(undefined, {
      retry: (_failureCount, error) => {
        if (error.data?.code === "UNAUTHORIZED") {
          return false;
        }
        return true;
      },
    }),
  );
  useEffect(() => {
    if (error?.data?.code === "UNAUTHORIZED") {
      router.push("/logout");
    }
  }, [error]);

  return <></>;
}
