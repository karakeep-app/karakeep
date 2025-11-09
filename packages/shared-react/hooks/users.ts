import { api } from "../trpc";

export function useUpdateUserSettings(
  ...opts: Parameters<typeof api.users.updateSettings.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.users.updateSettings.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.users.settings.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}

export function useDeleteAccount(
  ...opts: Parameters<typeof api.users.deleteAccount.useMutation>
) {
  return api.users.deleteAccount.useMutation(opts[0]);
}

export function useWhoAmI() {
  return api.users.whoami.useQuery();
}
