import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "@/lib/i18n/server";
import { ShieldAlert } from "lucide-react";

/** What the admin section shows someone who isn't an admin, instead of a redirect. */
export default async function AdminsOnly() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Empty className="max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert />
          </EmptyMedia>
          <EmptyTitle>{t("admin.admins_only.title")}</EmptyTitle>
          <EmptyDescription>
            {t("admin.admins_only.description")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">{t("admin.admins_only.back_home")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
