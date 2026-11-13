import Link from "next/link";
import KarakeepLogo from "@/components/KarakeepIcon";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "@/lib/i18n/server";
import { X } from "lucide-react";

export default async function PublicListPageNotFound() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-6">
      <Link
        href="/"
        aria-label={t("actions.go_home")}
        className="flex min-h-11 items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <KarakeepLogo height={38} />
      </Link>
      <Empty className="w-full border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <X />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={1}>
            {t("public_lists.not_found_title")}
          </EmptyTitle>
          <EmptyDescription>
            {t("public_lists.not_found_description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
