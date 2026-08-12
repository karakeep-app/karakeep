"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import * as THREE from "three";

import { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * The empty-queue hero (design/Keepsake Mobile Designs.html, screen 2e) —
 * a live Vanta.NET field behind "Nothing left to read.", shown only when
 * the mobile queue (search-as-home, phase 3) is genuinely empty. The
 * design's own note calls this out as a deliberate exception to an
 * otherwise-static app: "the one place ambient motion earns its keep ...
 * so the screen reads as calm rather than broken."
 *
 * `vanta`/`three` ship no types (see @types/vanta.d.ts) and the effect's
 * `color`/`backgroundColor` are plain 0xRRGGBB numbers, not CSS — so they
 * can't just reference `var(--k-accent)`. The design's own values
 * (0x7c5dff / 0x0e1116) happen to equal this fork's *default* theme
 * exactly (same situation as the tab bar), so at mount this reads the
 * live `--k-accent`/`--k-bg` custom properties off <html> — both are
 * always authored as plain hex in dense-theme.css/theme.ts — and converts
 * them through THREE.Color rather than hardcoding the design's numbers,
 * so the field follows the user's chosen accent and surface tone.
 *
 * The stat block below the hero swaps two of the design's four labels:
 * `avg_save_time` (no timing telemetry exists anywhere in this app — it's
 * not a stat Karakeep has ever recorded, not a formatting gap) and
 * `summarised%` (no aggregate summarisation-status count exists either)
 * are replaced with `tags_used` and `favourited`, both real fields off
 * `users.stats` — same "// snake_case" mono treatment the design calls
 * for, populated with numbers this app actually tracks instead of two
 * that don't exist yet.
 */
function readThemeColor(varName: string, fallbackHex: string): number {
  if (typeof window === "undefined")
    return new THREE.Color(fallbackHex).getHex();
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  try {
    return new THREE.Color(value || fallbackHex).getHex();
  } catch {
    return new THREE.Color(fallbackHex).getHex();
  }
}

const STAT_LABEL = "font-k-mono text-k-fg-dim text-[10px]";

export function MobileEmptyQueueHero() {
  const api = useTRPC();
  const vantaRef = useRef<HTMLDivElement>(null);
  const { data: stats } = useQuery(api.users.stats.queryOptions());

  useEffect(() => {
    let effect: { destroy(): void } | undefined;
    let cancelled = false;
    // Dynamic import: vanta/three add real weight (a 3D scene graph) that
    // every other mobile screen has no use for, so keep it out of their
    // bundles — only the empty-queue hero ever needs it, and it only
    // needs it once the queue is confirmed empty.
    import("vanta/src/vanta.net.js").then(({ default: NET }) => {
      if (cancelled || !vantaRef.current) return;
      effect = NET({
        el: vantaRef.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 1,
        color: readThemeColor("--k-accent", "#7c5dff"),
        backgroundColor: readThemeColor("--k-bg", "#0e1116"),
        points: 9,
        maxDistance: 21,
        spacing: 17,
        showDots: true,
      });
    });
    return () => {
      cancelled = true;
      effect?.destroy();
    };
  }, []);

  return (
    <div className="flex flex-col">
      <div className="border-k-border relative h-[240px] flex-none overflow-hidden border-b">
        <div ref={vantaRef} className="absolute inset-0" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--k-bg) 25%, transparent) 0%, color-mix(in srgb, var(--k-bg) 86%, transparent) 72%, var(--k-bg) 100%)",
          }}
        />
        <div className="absolute inset-x-[18px] bottom-[18px] flex flex-col gap-[8px]">
          <span className="font-k-mono text-k-accent text-[10px] tracking-[0.08em]">
            {"// queue_empty"}
          </span>
          <p className="text-k-fg text-[21px] font-semibold leading-[1.2] tracking-[-0.025em] [text-wrap:pretty]">
            Nothing left to read.
          </p>
          <p className="text-k-fg-muted max-w-[280px] text-[12.5px] leading-[1.6]">
            Share a link from any app, or tap{" "}
            <strong className="text-k-fg-dim font-semibold">+</strong> — the
            sheet closes the moment you save.
          </p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-x-[10px] gap-y-[14px] px-[18px] pb-[6px] pt-[16px]">
          <div className="flex flex-col gap-[3px]">
            <span className="text-k-fg text-[19px] font-semibold tracking-[-0.02em]">
              {stats.numBookmarks.toLocaleString()}
            </span>
            <span className={STAT_LABEL}>items_saved</span>
          </div>
          <div className="flex flex-col gap-[3px]">
            <span className="text-k-fg text-[19px] font-semibold tracking-[-0.02em]">
              {stats.numLists.toLocaleString()}
            </span>
            <span className={STAT_LABEL}>lists_active</span>
          </div>
          <div className="flex flex-col gap-[3px]">
            <span className="text-k-fg text-[19px] font-semibold tracking-[-0.02em]">
              {stats.numTags.toLocaleString()}
            </span>
            <span className={STAT_LABEL}>tags_used</span>
          </div>
          <div className="flex flex-col gap-[3px]">
            <span className="text-k-fg text-[19px] font-semibold tracking-[-0.02em]">
              {stats.numFavorites.toLocaleString()}
            </span>
            <span className={STAT_LABEL}>favourited</span>
          </div>
        </div>
      )}
    </div>
  );
}
