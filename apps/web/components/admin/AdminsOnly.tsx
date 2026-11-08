import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/server";
import { ShieldAlert } from "lucide-react";

/** What the admin section shows someone who isn't an admin, instead of a redirect. */
export default async function AdminsOnly() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <EmptyState
        className="w-full max-w-md"
        icon={ShieldAlert}
        title={t("admin.admins_only.title")}
        description={t("admin.admins_only.description")}
        action={
          <Button asChild>
            <Link href="/">{t("admin.admins_only.back_home")}</Link>
          </Button>
        }
      />
    </main>
  );
}
