import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

export function useUpdateUserSettings(
  opts?: Parameters<TRPCApi["users"]["updateSettings"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.users.updateSettings.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.users.settings.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdateUserAvatar(
  opts?: Parameters<TRPCApi["users"]["updateAvatar"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.users.updateAvatar.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.users.whoami.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteAccount(
  opts?: Parameters<TRPCApi["users"]["deleteAccount"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  return useMutation(api.users.deleteAccount.mutationOptions(opts));
}

export function useWhoAmI() {
  const api = useTRPC();
  return useQuery(api.users.whoami.queryOptions());
}
