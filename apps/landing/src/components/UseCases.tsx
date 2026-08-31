import {
  ArrowDownNarrowWide,
  BookOpen,
  BrainCircuit,
  FileText,
  Highlighter,
  Link2,
  Smartphone,
  Sparkles,
  Tag,
  Text,
  Workflow,
  Zap,
} from "lucide-react";

import FeatureShowcase from "./FeatureShowcase";
import RuleCardMockup from "./showcase/RuleCardMockup";
import {
  BrowserScreenshotCard,
  PaperScreenshotCard,
} from "./showcase/ScreenshotCard";
import SearchCardMockup from "./showcase/SearchCardMockup";
import TagsCardMockup from "./showcase/TagsCardMockup";

import libraryVignette from "/screenshots/library-vignette.webp?url";
import readerVignette from "/screenshots/reader-vignette.webp?url";

function SearchModesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 4h-5" />
      <path d="M10 4H3" />
      <path d="M21 12h-9" />
      <path d="M6 12H3" />
      <path d="M21 20h-3" />
      <path d="M12 20H3" />
      <circle cx="13" cy="4" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="20" r="2" />
    </svg>
  );
}

export default function UseCases() {
  return (
    <section className="bg-white px-4 pb-24 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <span className="bg-gradient-to-r from-[#7c3aed] to-[#db2777] bg-clip-text text-xs font-bold tracking-[0.14em] text-transparent">
          USE CASES
        </span>
        <h2 className="font-display mt-3.5 text-3xl font-bold tracking-tight text-neutral-900 sm:text-[44px] sm:leading-[1.15]">
          Save, organize, and rediscover
        </h2>
        <p className="mt-4 text-lg leading-[1.6] text-neutral-600">
          From quick captures to automated workflows — here&apos;s how Karakeep
          fits the way you collect.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-[1248px] flex-col gap-10">
        <FeatureShowcase
          label="BOOKMARKING"
          headline="One place for all your bookmarks"
          description="Save links, notes, images, and PDFs from any device. Karakeep automatically fetches titles, descriptions, and images so you never lose context."
          bullets={[
            { icon: Link2, text: "Save any link with one click" },
            { icon: FileText, text: "Store notes, images, and PDFs" },
            {
              icon: ArrowDownNarrowWide,
              text: "Auto-fetch metadata and thumbnails",
            },
          ]}
        >
          <BrowserScreenshotCard
            src={libraryVignette}
            alt="Saved bookmarks in Karakeep"
            width={1400}
            height={988}
          />
        </FeatureShowcase>

        <FeatureShowcase
          label="ORGANIZATION"
          headline="Let AI organize your bookmarks"
          description="Karakeep uses AI to automatically tag and categorize your bookmarks. Stop spending time filing things away — just save and let AI do the work."
          bullets={[
            { icon: BrainCircuit, text: "Automatic AI-powered tagging" },
            { icon: Text, text: "AI-generated summaries" },
            { icon: Zap, text: "Instant organization as you save" },
          ]}
          reverse
        >
          <TagsCardMockup />
        </FeatureShowcase>

        <FeatureShowcase
          label="READING"
          headline="Read and highlight with ease"
          description="Enjoy saved articles in a clean, distraction-free reader view. Highlight important passages and keep them organized for quick reference."
          bullets={[
            {
              icon: BookOpen,
              text: "Distraction-free reader view for articles",
            },
            { icon: Highlighter, text: "Highlight text on any saved page" },
            { icon: Smartphone, text: "Read offline in the mobile apps" },
          ]}
        >
          <PaperScreenshotCard
            src={readerVignette}
            alt="Highlighted passage in reader view"
            width={1500}
            height={1270}
          />
        </FeatureShowcase>

        <FeatureShowcase
          label="AUTOMATION"
          headline="Automate your workflow"
          description="Create powerful automation rules to manage your bookmarks. Automatically tag, move, or organize content based on custom conditions."
          bullets={[
            { icon: Workflow, text: "Build custom automation rules" },
            { icon: Zap, text: "Trigger actions on new bookmarks" },
            { icon: Tag, text: "Auto-tag based on URL patterns or content" },
          ]}
          reverse
        >
          <RuleCardMockup />
        </FeatureShowcase>

        <FeatureShowcase
          label="SEARCH"
          headline="Find it the way you remember it"
          description="Search the full text of everything you save — or switch to semantic search and find bookmarks by what they mean, not just the words they contain."
          bullets={[
            {
              icon: Zap,
              text: "Blazingly fast full-text search across everything you save",
            },
            {
              icon: Sparkles,
              text: "Semantic mode finds conceptually similar bookmarks",
            },
            {
              icon: SearchModesIcon,
              text: "Keyword, hybrid, and semantic modes in the search bar",
            },
          ]}
        >
          <SearchCardMockup />
        </FeatureShowcase>
      </div>
    </section>
  );
}
