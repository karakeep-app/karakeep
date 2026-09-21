import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useTRPC } from "@karakeep/shared-react/trpc";

export function WebhookSelector({
  value,
  onChange,
  className,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  className?: string;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data, isPending, isError } = useQuery(
    api.webhooks.list.queryOptions(),
  );

  if (isPending) {
    return <LoadingSpinner />;
  }

  if (isError) {
    return (
      <p className={cn("text-sm text-destructive", className)}>
        {t("settings.rules.failed_to_load_webhooks")}
      </p>
    );
  }

  if (data.webhooks.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("settings.rules.no_webhooks_configured")}
      </p>
    );
  }

  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={t("settings.rules.select_a_webhook")} />
      </SelectTrigger>
      <SelectContent>
        {data.webhooks.map((webhook) => (
          <SelectItem key={webhook.id} value={webhook.id}>
            {webhook.url}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
