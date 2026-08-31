import { Plus, Rss } from "lucide-react";

import { MockupCard } from "./MockupCard";

const feeds = [
  { name: "Hacker News", url: "hnrss.org/frontpage" },
  { name: "The Verge", url: "theverge.com/rss/index.xml" },
  { name: "Weeknight Kitchen", url: "weeknightkitchen.com/feed" },
];

function Toggle() {
  return (
    <div className="flex h-5 w-9 shrink-0 items-center rounded-full bg-neutral-900 px-0.5">
      <div className="ml-auto size-4 rounded-full bg-white" />
    </div>
  );
}

/** RSS feeds settings mockup: subscribed feeds with enabled toggles. */
export default function RssFeedsCardMockup() {
  return (
    <MockupCard className="max-w-[420px] bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-neutral-900">
          RSS Feeds
        </span>
        <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5">
          <Plus className="size-3.5 text-neutral-600" />
          <span className="text-xs font-medium text-neutral-700">Add Feed</span>
        </div>
      </div>
      <div className="mt-2 flex flex-col divide-y divide-neutral-100">
        {feeds.map((feed) => (
          <div key={feed.name} className="flex items-center gap-3 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
              <Rss className="size-4 text-neutral-600" />
            </div>
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-neutral-900">
                {feed.name}
              </span>
              <span className="truncate text-xs text-neutral-500">
                {feed.url}
              </span>
            </div>
            <Toggle />
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-100 pt-3 text-xs text-neutral-400">
        Checked every hour · New posts saved automatically
      </div>
    </MockupCard>
  );
}
