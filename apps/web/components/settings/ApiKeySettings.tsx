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
import { formatDistanceToNow } from "date-fns";

import AddApiKey from "./AddApiKey";
import DeleteApiKey from "./DeleteApiKey";
import RegenerateApiKey from "./RegenerateApiKey";

export default async function ApiKeys() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const keys = await api.apiKeys.list();
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="mb-2 text-lg font-medium">
          {t("settings.api_keys.api_keys")}
        </div>
        <AddApiKey />
      </div>
      <div className="mt-2">
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
                    {formatDistanceToNow(key.createdAt, { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {key.lastUsedAt
                      ? formatDistanceToNow(key.lastUsedAt, { addSuffix: true })
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
      </div>
    </div>
  );
}
