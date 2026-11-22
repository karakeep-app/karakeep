import type { SatteriProcessorOptions } from "@astrojs/markdown-satteri";

import { GITHUB_LINK } from "../constants";

type MdastPluginEntry = NonNullable<
  SatteriProcessorOptions["mdastPlugins"]
>[number];
type MdastPluginFactory = Extract<
  MdastPluginEntry,
  (...args: never) => unknown
>;
type MdastPlugin = Exclude<
  MdastPluginEntry,
  MdastPluginFactory | readonly unknown[] | null | undefined | false
>;

// Matches the repo-root `release-notes/` folder that the `releases` content
// collection reads from. The plugins below only apply to those files.
function isReleaseNote(fileURL: URL | undefined) {
  return !!fileURL && /\/release-notes\/[^/]+\.md$/.test(fileURL.pathname);
}

/**
 * Release notes are written for GitHub releases: they start with a `# 0.35.0`
 * heading and some of them use `#` for their sections too. On the blog the
 * page renders its own <h1>, so drop the leading heading and, if the note has
 * other top-level headings, push every heading down a level so the page keeps
 * a single <h1>.
 */
function releaseNoteHeadings(source: string): MdastPlugin {
  source = source.replace(/^---\n[\s\S]*?\n---\n/, "");
  const startsWithH1 = /^\s*# /.test(source);
  const h1Count = source.match(/^# /gm)?.length ?? 0;
  const shift = h1Count > (startsWithH1 ? 1 : 0);
  return {
    name: "karakeep-release-note-headings",
    heading(node, ctx) {
      if (
        startsWithH1 &&
        node.depth === 1 &&
        ctx.indexOf(node) === 0 &&
        ctx.parent(node)?.type === "root"
      ) {
        ctx.removeNode(node);
        return;
      }
      if (shift) {
        ctx.setProperty(
          node,
          "depth",
          Math.min(node.depth + 1, 6) as typeof node.depth,
        );
      }
    },
  };
}

/**
 * Some notes embed `<img width="auto" height="50">` badges. Tailwind's
 * preflight sets `img { height: auto }`, which beats the attribute and blows
 * them up to full width, so turn the height into an inline style. Images with
 * a numeric width (screenshots with their intrinsic size) scale fine as is.
 */
const releaseNoteImageSizes: MdastPlugin = {
  name: "karakeep-release-note-image-sizes",
  html(node, ctx) {
    const value = node.value.replace(/<img\b[^>]*>/g, (tag) => {
      const height = /\sheight="(\d+)"/.exec(tag)?.[1];
      if (!height || /\s(width="\d|style=)/.test(tag)) return tag;
      return tag.replace(
        /^<img\b/,
        `<img style="height:${height}px;width:auto"`,
      );
    });
    if (value !== node.value) ctx.setProperty(node, "value", value);
  },
};

// `@user` (but not emails or npm scopes like `@karakeep/cli`) and `#1234`.
const GITHUB_REF =
  /(^|[^\w@/`])(@([a-z\d](?:[a-z\d-]{0,38}))(?![\w/-])|#(\d+)\b)/gi;

/**
 * GitHub links `@user` and `#1234` in release notes automatically. Do the same
 * here so the credits and issue references stay clickable on the blog.
 */
const githubReferences: MdastPlugin = {
  name: "karakeep-github-references",
  text(node, ctx) {
    let parent: ReturnType<typeof ctx.parent> = ctx.parent(node);
    for (; parent; parent = ctx.parent(parent)) {
      if (parent.type === "link" || parent.type === "linkReference") return;
    }

    const value = node.value;
    const out: Parameters<typeof ctx.replaceNode>[1] & unknown[] = [];
    let last = 0;
    for (const match of value.matchAll(GITHUB_REF)) {
      const [, lead, ref, user, issue] = match;
      const start = match.index + lead.length;
      if (start > last) {
        out.push({ type: "text", value: value.slice(last, start) });
      }
      out.push({
        type: "link",
        url: user
          ? `https://github.com/${user}`
          : `${GITHUB_LINK}/issues/${issue}`,
        children: [{ type: "text", value: ref }],
      });
      last = start + ref.length;
    }
    if (out.length === 0) return;
    if (last < value.length) {
      out.push({ type: "text", value: value.slice(last) });
    }
    ctx.replaceNode(node, out);
  },
};

export const releaseNotePlugins: MdastPluginFactory = (ctx) =>
  isReleaseNote(ctx.fileURL)
    ? [releaseNoteHeadings(ctx.source), releaseNoteImageSizes, githubReferences]
    : null;
