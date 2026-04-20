import RelativeTime from "@/components/ui/relative-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";

import DeleteApiKey from "./DeleteApiKey";
import RegenerateApiKey from "./RegenerateApiKey";
import { SettingsSection } from "./SettingsPage";

export default async function ApiKeys() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const keys = await api.apiKeys.list();
  return (
    <SettingsSection>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.name")}</TableHead>
            <TableHead>{t("common.key")}</TableHead>
            <TableHead>{t("common.created_at")}</TableHead>
            <TableHead>{t("common.last_used")}</TableHead>
            <TableHead>{t("common.action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.keys.map((key) => {
            return (
              <TableRow key={key.id}>
                <TableCell>{key.name}</TableCell>
                <TableCell>**_{key.keyId}_**</TableCell>
                <TableCell>
                  <RelativeTime date={key.createdAt} />
                </TableCell>
                <TableCell>
                  {key.lastUsedAt
                    ? <RelativeTime date={key.lastUsedAt} />
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RegenerateApiKey name={key.name} id={key.id} />
                    <DeleteApiKey name={key.name} id={key.id} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow></TableRow>
        </TableBody>
      </Table>
    </SettingsSection>
  );
}
