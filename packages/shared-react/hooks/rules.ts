import { api } from "../trpc";

export function useCreateRule(
  ...opts: Parameters<typeof api.rules.create.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.rules.create.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.rules.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}

export function useUpdateRule(
  ...opts: Parameters<typeof api.rules.update.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.rules.update.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.rules.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}

export function useDeleteRule(
  ...opts: Parameters<typeof api.rules.delete.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.rules.delete.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.rules.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}
