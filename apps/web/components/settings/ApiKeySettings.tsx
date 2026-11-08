import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import RelativeTime from "@/components/ui/relative-time";
import {
  StackedLabel,
  stackedTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n/server";
import { KeyRound } from "lucide-react";

import AddApiKey from "./AddApiKey";
import ApiKeyRowActions from "./ApiKeyRowActions";
import { SettingsSection } from "./SettingsPage";
import { isAdminScope, scopeLabel } from "./apiKeyScopes";

type ApiKeyList = Awaited<
  ReturnType<typeof import("@/server/api/client").api.apiKeys.list>
>["keys"];

/** The page fetches the keys, as it also needs them for its header action. */
export default async function ApiKeys({
  isAdmin,
  keys,
}: {
  isAdmin: boolean;
  keys: ApiKeyList;
}) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  if (keys.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title={t("settings.api_keys.no_keys")}
        description={t("settings.api_keys.no_keys_description")}
        action={<AddApiKey isAdmin={isAdmin} />}
      />
    );
  }
  return (
    <SettingsSection>
      <Table inCard className={stackedTable.table}>
        <TableHeader className={stackedTable.header}>
          <TableRow>
            <TableHead>{t("common.name")}</TableHead>
            <TableHead>{t("common.key")}</TableHead>
            <TableHead>{t("settings.api_keys.scopes.scopes")}</TableHead>
            <TableHead>{t("common.created_at")}</TableHead>
            <TableHead>{t("common.last_used")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("common.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={stackedTable.body}>
          {keys.map((key) => {
            const visibleScopes = key.scopes.filter(
              (scope) => isAdmin || !isAdminScope(scope),
            );
            return (
              <TableRow key={key.id} className={stackedTable.row}>
                <TableCell className={stackedTable.primaryCell}>
                  {key.name}
                </TableCell>
                <TableCell className={stackedTable.cell}>
                  <span className="whitespace-nowrap font-mono">
                    ••••{key.keyId.slice(-3)}
                  </span>
                </TableCell>
                <TableCell className={stackedTable.cell}>
                  <div className="flex max-w-72 flex-wrap gap-1 py-1 sm:py-0">
                    {visibleScopes.map((scope) => (
                      <Badge key={scope} variant="outline">
                        {scopeLabel(t, scope)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className={stackedTable.cell}>
                  <StackedLabel>{t("common.created_at")}</StackedLabel>
                  <RelativeTime date={key.createdAt} />
                </TableCell>
                <TableCell className={stackedTable.cell}>
                  <StackedLabel>{t("common.last_used")}</StackedLabel>
                  {key.lastUsedAt ? (
                    <RelativeTime date={key.lastUsedAt} />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className={stackedTable.actionsCell}>
                  <ApiKeyRowActions name={key.name} id={key.id} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </SettingsSection>
  );
}
