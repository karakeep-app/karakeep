import type { ComponentType, RefObject } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth/client";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import {
  BookOpen,
  Camera,
  ChevronDown,
  ExpandIcon,
  ExternalLink,
  FileText,
  LayoutPanelTop,
  Save,
  Settings,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import type {
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";
import {
  usePreserveBookmarkVideo,
  useRecrawlBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";

import type { ContentRenderer } from "./content-renderers";
import { IconTooltip } from "./IconControl";
import ReaderSettingsPopover from "./ReaderSettingsPopover";

const GROUP_LABEL_CLASS = "py-1 text-xs font-medium text-muted-foreground";

/** Makes the offline copies that the preview's views show. */
function useOfflineCopyActions(bookmarkId: string) {
  const { t } = useTranslation();
  const onError = () => {
    toast.error(t("common.something_went_wrong"));
  };
  const { mutate: archivePage } = useRecrawlBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.full_page_archive"));
    },
    onError,
  });
  const { mutate: archivePdf } = useRecrawlBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.preserve_pdf"));
    },
    onError,
  });
  const { mutate: downloadVideo } = usePreserveBookmarkVideo({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.preserve_video"));
    },
    onError,
  });
  return {
    archive: () => archivePage({ bookmarkId, archiveFullPage: true }),
    pdf: () => archivePdf({ bookmarkId, storePdf: true }),
    video: () => downloadVideo({ bookmarkId }),
  };
}

interface ViewOption {
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** For bars with little room. */
  shortLabel?: string;
  /** Left out of the menu if not, while what's showing still gets its name. */
  available: boolean;
}

/**
 * The one control for how a link is shown: which view, the copies that could add
 * another, and the settings that go with the reader. Having the reader's settings
 * and the full screen link in here is what keeps the bar above the preview short.
 */
export default function LinkViewMenu({
  bookmark,
  link,
  section,
  availableRenderers,
  compact,
  columnRef,
  anchorBottom,
  originalUrl,
  onSelectSection,
  onShowContent,
}: {
  bookmark: ZBookmark;
  link: ZBookmarkedLink;
  section: string;
  availableRenderers: ContentRenderer[];
  /** Uses the short names, for a bar that has little room. */
  compact?: boolean;
  columnRef: RefObject<HTMLElement | null>;
  /** Where the reader's settings open from, on screen. */
  anchorBottom: () => number;
  /** Offered in here at phone width, where the bar has no room for its button. */
  originalUrl?: string | null;
  onSelectSection: (section: string) => void;
  /** Brings the content back for what's picked, if something else is showing. */
  onShowContent?: () => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const clientConfig = useClientConfig();
  const { hasSessionChanges, hasLocalOverrides } = useReaderSettings();
  const offlineCopies = useOfflineCopyActions(bookmark.id);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Opens once the menu has closed, as it would take the focus back otherwise.
  const openSettingsOnClose = useRef(false);

  const canMakeCopies =
    session?.user?.id === bookmark.userId && !clientConfig.demoMode;
  const hasArchive =
    link.fullPageArchiveAssetId ?? link.precrawledArchiveAssetId;

  const views: ViewOption[] = [
    ...availableRenderers.map((renderer) => ({
      id: renderer.id,
      icon: renderer.icon,
      label: renderer.name,
      available: true,
    })),
    {
      id: "overview",
      icon: LayoutPanelTop,
      label: t("preview.page_overview"),
      shortLabel: t("preview.short_views.overview"),
      available: true,
    },
    {
      id: "cached",
      icon: BookOpen,
      label: t("preview.reader_view"),
      shortLabel: t("preview.short_views.reader"),
      available: link.readerViewStatus !== "unavailable",
    },
    {
      id: "screenshot",
      icon: Camera,
      label: t("common.screenshot"),
      available: !!link.screenshotAssetId,
    },
    {
      id: "pdf",
      icon: FileText,
      label: t("common.pdf"),
      available: !!link.pdfAssetId,
    },
    {
      id: "archive",
      icon: Save,
      label: t("preview.archived_page"),
      available: !!hasArchive,
    },
    {
      id: "video",
      icon: Video,
      label: t("common.video"),
      available: !!link.videoAssetId,
    },
  ];

  const missingCopies = canMakeCopies
    ? [
        !link.pdfAssetId && {
          label: t("preview.saved_copies.no_pdf"),
          run: offlineCopies.pdf,
        },
        !hasArchive && {
          label: t("preview.saved_copies.no_archive"),
          run: offlineCopies.archive,
        },
        !link.videoAssetId &&
          clientConfig.crawler.videoDownloadOnDemand && {
            label: t("preview.saved_copies.no_video"),
            run: offlineCopies.video,
          },
      ].filter((copy) => !!copy)
    : [];

  const current = views.find((view) => view.id === section) ?? views[0];
  const CurrentIcon = current.icon;
  const isReader = section === "cached";
  const hasCustomSettings = hasSessionChanges || hasLocalOverrides;
  const settingsDot = hasCustomSettings && (
    <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
  );

  return (
    <>
      {/* Not modal: "Open full screen" leaves the page from inside the preview
          dialog, and a modal menu closing at the same time as the dialog leaves
          pointer-events: none on the body of the next page. */}
      <DropdownMenu modal={false}>
        <IconTooltip label={t("preview.view_options")} side="bottom">
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              variant="outline"
              size="none"
              aria-label={`${t("preview.view_options")}: ${current.label}`}
              className="h-8 min-w-0 gap-1.5 px-2 text-sm font-normal max-sm:h-11 [@media(pointer:coarse)]:h-11"
            >
              <CurrentIcon className="size-4 shrink-0 text-muted-foreground max-[359px]:hidden" />
              <span className="truncate">
                {compact
                  ? (current.shortLabel ?? current.label)
                  : current.label}
              </span>
              {isReader && settingsDot}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
        </IconTooltip>
        <DropdownMenuContent
          align="end"
          className="w-72 max-w-[calc(100vw-1rem)]"
          onCloseAutoFocus={(e) => {
            if (openSettingsOnClose.current) {
              openSettingsOnClose.current = false;
              e.preventDefault();
              setSettingsOpen(true);
            }
          }}
        >
          <DropdownMenuRadioGroup
            value={section}
            onValueChange={(value) => {
              onSelectSection(value);
              onShowContent?.();
            }}
          >
            {views
              .filter((view) => view.available)
              .map(({ id, icon: Icon, label }) => (
                <DropdownMenuRadioItem key={id} value={id}>
                  <Icon className="size-4 shrink-0" />
                  {label}
                </DropdownMenuRadioItem>
              ))}
          </DropdownMenuRadioGroup>
          {missingCopies.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel inset className={GROUP_LABEL_CLASS}>
                  {t("actions.offline_copies")}
                </DropdownMenuLabel>
                {missingCopies.map(({ label, run }) => (
                  <DropdownMenuItem
                    key={label}
                    inset
                    className="min-h-8 text-xs text-muted-foreground"
                    onSelect={run}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
          {isReader && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel inset className={GROUP_LABEL_CLASS}>
                  {t("preview.reader_options")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  inset
                  onSelect={() => {
                    openSettingsOnClose.current = true;
                    onShowContent?.();
                  }}
                >
                  <Settings className="size-4" />
                  {t("preview.reading_settings")}
                  <span className="ml-auto">{settingsDot}</span>
                </DropdownMenuItem>
                <DropdownMenuItem inset asChild>
                  <Link href={`/reader/${bookmark.id}`}>
                    <ExpandIcon className="size-4" />
                    {t("preview.open_fullscreen")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
          {originalUrl && <DropdownMenuSeparator className="sm:hidden" />}
          {originalUrl && (
            <DropdownMenuItem inset asChild className="sm:hidden">
              <a href={originalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                {t("preview.view_original")}
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {isReader && (
        <ReaderSettingsPopover
          hideTrigger
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          columnRef={columnRef}
          anchorBottom={anchorBottom}
          returnFocusTo={triggerRef}
        />
      )}
    </>
  );
}
