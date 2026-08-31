import {
  ArrowDownNarrowWide,
  Bookmark,
  BrainCircuit,
  CheckCheck,
  Highlighter,
  Plug,
  Rss,
  Server,
  SunMoon,
  TextSearch,
  Users,
  Workflow,
} from "lucide-react";

import ClosingCta from "./components/ClosingCta";
import FeaturesGrid from "./components/FeaturesGrid";
import LlmReady from "./components/LlmReady";
import OpenSource from "./components/OpenSource";
import Platforms from "./components/Platforms";
import UseCases from "./components/UseCases";

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
    description:
      "Search through all your bookmarks using full text or semantic search.",
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

export default function Homepage() {
  return (
    <>
      <UseCases />
      <LlmReady />
      <FeaturesGrid features={featuresList} />
      <Platforms />
      <OpenSource />
      <ClosingCta />
    </>
  );
}
