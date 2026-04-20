import {
  ArrowDownNarrowWide,
  BookOpen,
  Bookmark,
  BrainCircuit,
  CheckCheck,
  FileText,
  Highlighter,
  Link2,
  Plug,
  Rss,
  Server,
  SunMoon,
  Tag,
  TextSearch,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

import FeaturesGrid from "./components/FeaturesGrid";
import OpenSource from "./components/OpenSource";
import Platforms from "./components/Platforms";
import readerViewScreenshot from "/screenshots/reader-view.webp?url";
import ruleEngineScreenshot from "/screenshots/rule-engine.webp?url";
import searchScreenshot from "/screenshots/search.webp?url";
import tagsScreenshot from "/screenshots/tags.webp?url";

const featuresList = [
  {
    icon: Bookmark,
    title: "Bookmark",
    description: "Bookmark links, take simple notes and store images and PDFs.",
  },
  {
    icon: BrainCircuit,
    title: "AI Tagging",
    description:
      "Automatically tags your bookmarks using AI for faster retrieval.",
  },
  {
    icon: Users,
    title: "Collaborative Lists",
    description:
      "Collaborate with others on shared lists for team bookmarking.",
  },
  {
    icon: Rss,
    title: "RSS Feeds",
    description:
      "Auto-hoard content from RSS feeds to stay updated effortlessly.",
  },
  {
    icon: Workflow,
    title: "Rule Engine",
    description:
      "Customize bookmark management with powerful automation rules.",
  },
  {
    icon: Highlighter,
    title: "Highlights",
    description:
      "Highlight text on any saved page and keep your highlights organized for quick reference.",
  },
  {
    icon: Plug,
    title: "API & Webhooks",
    description: "Integrate with other services using REST API and webhooks.",
  },
  {
    icon: TextSearch,
    title: "Full Text Search",
    description: "Search through all your bookmarks using full text search.",
  },
  {
    icon: Server,
    title: "Self Hosting",
    description: "Easy self hosting with Docker for privacy and control.",
  },
  {
    icon: CheckCheck,
    title: "Bulk Actions",
    description: "Quickly manage your bookmarks with bulk actions.",
  },
  {
    icon: ArrowDownNarrowWide,
    title: "Auto Fetch",
    description:
      "Automatically fetches title, description and images for links.",
  },
  {
    icon: SunMoon,
    title: "Dark Mode",
    description: "Karakeep supports dark mode for better reading experience.",
  },
];

const _showcases = [
  {
    label: "BOOKMARKING",
    title: "Save Everything",
    headline: "One place for all your bookmarks",
    description:
      "Save links, notes, images, and PDFs from any device. Karakeep automatically fetches titles, descriptions, and images so you never lose context.",
    bullets: [
      { icon: Link2, text: "Save any link with one click" },
      { icon: FileText, text: "Store notes, images, and PDFs" },
      {
        icon: ArrowDownNarrowWide,
        text: "Auto-fetch metadata and thumbnails",
      },
    ],
    screenshot: tagsScreenshot,
    screenshotAlt: "Karakeep tags view",
    reverse: false,
  },
  {
    label: "ORGANIZATION",
    title: "AI-Powered Organization",
    headline: "Let AI organize your bookmarks",
    description:
      "Karakeep uses AI to automatically tag and categorize your bookmarks. Stop spending time filing things away — just save and let AI do the work.",
    bullets: [
      { icon: BrainCircuit, text: "Automatic AI-powered tagging" },
      { icon: Tag, text: "Smart categorization" },
      { icon: Zap, text: "Instant organization as you save" },
    ],
    screenshot: searchScreenshot,
    screenshotAlt: "Karakeep search view",
    reverse: true,
  },
  {
    label: "READING",
    title: "Reader View & Highlights",
    headline: "Read and highlight with ease",
    description:
      "Enjoy saved articles in a clean, distraction-free reader view. Highlight important passages and keep them organized for quick reference.",
    bullets: [
      { icon: BookOpen, text: "Distraction-free reader view for articles" },
      { icon: Highlighter, text: "Highlight text on any saved page" },
    ],
    screenshot: readerViewScreenshot,
    screenshotAlt: "Karakeep reader view",
    reverse: false,
  },
  {
    label: "AUTOMATION",
    title: "Rule Engine",
    headline: "Automate your workflow",
    description:
      "Create powerful automation rules to manage your bookmarks. Automatically tag, move, or organize content based on custom conditions.",
    bullets: [
      { icon: Workflow, text: "Build custom automation rules" },
      { icon: Zap, text: "Trigger actions on new bookmarks" },
      { icon: Tag, text: "Auto-tag based on URL patterns or content" },
    ],
    screenshot: ruleEngineScreenshot,
    screenshotAlt: "Karakeep rule engine",
    reverse: true,
  },
];

export default function Homepage() {
  return (
    <>
      <FeaturesGrid features={featuresList} />
      <Platforms />
      <OpenSource />
    </>
  );
}
