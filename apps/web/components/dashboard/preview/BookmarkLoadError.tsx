import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, FileQuestion, Home } from "lucide-react";

interface LoadError {
  data?: { code: string } | null;
}

const isNotFound = (error: LoadError) => error.data?.code === "NOT_FOUND";

/** A missing bookmark won't turn up on a second look. */
export function retryBookmarkQuery(failures: number, error: LoadError) {
  return !isNotFound(error) && failures < 2;
}

/** For a client-side load that failed: the same state the server's 404 shows. */
export default function BookmarkLoadError({
  error,
  onRetry,
  isRetrying,
  className,
}: {
  error: LoadError;
  onRetry: () => void;
  isRetrying: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const notFound = isNotFound(error);

  // A deep link opened in a new tab has nothing to go back to.
  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard/bookmarks");
    }
  };

  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {notFound ? <FileQuestion /> : <AlertTriangle />}
        </EmptyMedia>
        <EmptyTitle>
          {notFound
            ? t("common.page_not_found")
            : t("preview.load_failed_title")}
        </EmptyTitle>
        <EmptyDescription>
          {notFound
            ? t("common.page_not_found_description")
            : t("preview.load_failed_description")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="size-4" />
              {t("actions.go_back")}
            </Button>
            {notFound ? (
              <Button asChild>
                <Link href="/dashboard/bookmarks">
                  <Home className="size-4" />
                  {t("actions.go_home")}
                </Link>
              </Button>
            ) : (
              <ActionButton loading={isRetrying} onClick={onRetry}>
                {t("actions.retry")}
              </ActionButton>
            )}
          </div>
        }
      </EmptyContent>
    </Empty>
  );
}
