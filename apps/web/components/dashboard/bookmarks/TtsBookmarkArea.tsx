import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Gauge,
  Headphones,
  Mic,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";

import { useGenerateTts } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  getTtsSnapshot,
  TtsSnapshot,
  waitForTtsChunk,
} from "@/lib/ttsPlayback";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

type PlaybackState =
  | "idle"
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "error";

// Plays a sequence of pre-generated audio chunks back-to-back using two
// <audio> elements: chunk i plays on slot i % 2 while chunk i + 1 preloads on
// the other. Native media elements time-stretch when playbackRate changes
// (preservesPitch), so speeding up doesn't turn the voice into a chipmunk the
// way resampling a Web Audio buffer would. The playlist is sized from the
// job's known total, but chunks are generated incrementally: when the next
// one isn't ready yet we wait for it (polling with backoff) instead of ending
// playback.
// ponytail: resume point lives in localStorage (per browser), not the DB.
const posKey = (id: string) => `tts-pos:${id}`;
const SPEED_KEY = "tts-speed";
function loadSpeed() {
  try {
    const n = parseFloat(localStorage.getItem(SPEED_KEY) ?? "");
    return n >= 0.5 && n <= 3 ? n : 1;
  } catch {
    return 1;
  }
}
function loadPos(id: string, total: number) {
  try {
    const n = parseInt(localStorage.getItem(posKey(id)) ?? "0", 10);
    return n > 0 && n < total ? n : 0;
  } catch {
    return 0;
  }
}
function savePos(id: string, n: number) {
  try {
    if (n > 0) localStorage.setItem(posKey(id), String(n));
    else localStorage.removeItem(posKey(id));
  } catch {
    // storage unavailable
  }
}

function useChunkAudioPlayer(
  snapshot: TtsSnapshot,
  refetch: () => Promise<TtsSnapshot>,
  bookmarkId: string,
  title: string,
  autoPlay: boolean,
) {
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const slotsRef = useRef<{ el: HTMLAudioElement; assetId: string | null }[]>(
    [],
  );
  const activeRef = useRef<HTMLAudioElement | null>(null);
  // Bumped whenever playback is started, stopped or skipped, so stale async
  // work (a poll for a chunk, a pending play()) quietly gives up.
  const tokenRef = useRef(0);
  const [state, setState] = useState<PlaybackState>("idle");
  const [index, setIndex] = useState(() =>
    loadPos(bookmarkId, snapshot.totalChunks),
  );
  const [speed, setSpeed] = useState(loadSpeed);
  const speedRef = useRef(speed);

  const applySpeed = useCallback((el: HTMLAudioElement) => {
    // Changing src re-runs the media load algorithm, which resets
    // playbackRate to defaultPlaybackRate, so set both.
    el.defaultPlaybackRate = speedRef.current;
    el.playbackRate = speedRef.current;
    el.preservesPitch = true;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      // storage unavailable
    }
    speedRef.current = speed;
    slotsRef.current.forEach((s) => applySpeed(s.el));
  }, [speed, applySpeed]);

  const getSlot = useCallback((n: number) => {
    const slots = slotsRef.current;
    if (!slots[n]) {
      const el = new Audio();
      el.preload = "auto";
      slots[n] = { el, assetId: null };
    }
    return slots[n];
  }, []);

  const loadInto = useCallback(
    (n: number, assetId: string) => {
      const slot = getSlot(n);
      if (slot.assetId !== assetId) {
        slot.assetId = assetId;
        slot.el.src = getAssetUrl(assetId);
        slot.el.load();
      }
      applySpeed(slot.el);
      return slot;
    },
    [getSlot, applySpeed],
  );

  const silenceAll = useCallback(() => {
    for (const s of slotsRef.current.filter(Boolean)) {
      s.el.onended = null;
      s.el.onerror = null;
      s.el.pause();
    }
    activeRef.current = null;
  }, []);

  const playIndex = useCallback(
    async (i: number) => {
      if (i < 0) {
        return;
      }
      const token = ++tokenRef.current;
      const cancelled = () => tokenRef.current !== token;
      silenceAll();

      setState(
        i < snapshotRef.current.assetIds.length ? "loading" : "buffering",
      );
      const result = await waitForTtsChunk(i, {
        getSnapshot: () => snapshotRef.current,
        refetch,
        isCancelled: cancelled,
      });
      if (cancelled() || result.kind === "cancelled") {
        return;
      }
      if (result.kind === "ended") {
        setState("idle");
        setIndex(0);
        return;
      }
      if (result.kind === "failed") {
        setState("error");
        return;
      }

      setState("loading");
      const slot = loadInto(i % 2, result.assetId);
      const el = slot.el;
      el.currentTime = 0;
      el.onended = () => {
        if (cancelled()) {
          return;
        }
        setIndex(i + 1);
        void playIndex(i + 1);
      };
      el.onerror = () => {
        if (!cancelled()) {
          setState("error");
        }
      };
      try {
        await el.play();
      } catch {
        if (!cancelled()) {
          setState("error");
        }
        return;
      }
      if (cancelled()) {
        return;
      }
      activeRef.current = el;
      setIndex(i);
      setState("playing");
      // Preload the next chunk on the other slot while this one plays. If it
      // doesn't exist yet we'll wait for it when this one ends.
      const nextId = snapshotRef.current.assetIds[i + 1];
      if (nextId) {
        loadInto((i + 1) % 2, nextId);
      }
    },
    [loadInto, refetch, silenceAll],
  );

  // Chunks can show up while the current one is playing; preload the next
  // one as soon as it's known.
  const assetCount = snapshot.assetIds.length;
  useEffect(() => {
    if (state !== "playing") {
      return;
    }
    const nextId = snapshotRef.current.assetIds[index + 1];
    if (nextId) {
      loadInto((index + 1) % 2, nextId);
    }
  }, [assetCount, index, state, loadInto]);

  const play = useCallback(() => {
    if (state === "paused" && activeRef.current) {
      void activeRef.current.play();
      setState("playing");
      return;
    }
    void playIndex(index);
  }, [index, playIndex, state]);

  const pause = useCallback(() => {
    if (activeRef.current) {
      activeRef.current.pause();
    } else {
      // Still loading / waiting for a chunk: abandon that work; play()
      // restarts the current chunk.
      tokenRef.current++;
    }
    setState("paused");
  }, []);

  const stop = useCallback(() => {
    tokenRef.current++;
    silenceAll();
    for (const s of slotsRef.current.filter(Boolean)) {
      s.assetId = null;
      s.el.removeAttribute("src");
      s.el.load();
    }
    // Keep `index`: the resume point survives closing the player.
    setState("idle");
  }, [silenceAll]);

  const skip = useCallback(
    (delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= snapshotRef.current.totalChunks) {
        return;
      }
      setIndex(target);
      void playIndex(target);
    },
    [index, playIndex],
  );

  useEffect(() => {
    savePos(bookmarkId, index);
  }, [bookmarkId, index]);

  // Lock-screen / headset / keyboard media keys, like BookOrbit.
  const handlersRef = useRef({ play, pause, stop, skip });
  handlersRef.current = { play, pause, stop, skip };
  const active = state !== "idle";
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) {
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      album: "Karakeep",
    });
    const set = (a: MediaSessionAction, fn: (() => void) | null) =>
      navigator.mediaSession.setActionHandler(a, fn);
    set("play", () => handlersRef.current.play());
    set("pause", () => handlersRef.current.pause());
    set("stop", () => handlersRef.current.stop());
    set("previoustrack", () => handlersRef.current.skip(-1));
    set("nexttrack", () => handlersRef.current.skip(1));
    return () => {
      for (const a of [
        "play",
        "pause",
        "stop",
        "previoustrack",
        "nexttrack",
      ] as const) {
        set(a, null);
      }
    };
  }, [active, title]);
  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState =
        state === "playing"
          ? "playing"
          : state === "paused"
            ? "paused"
            : "none";
    }
  }, [state]);

  // Space / arrows, only while a narration is active.
  const playing =
    state === "playing" || state === "loading" || state === "buffering";
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button, [contenteditable]")) {
        return;
      }
      const hd = handlersRef.current;
      if (e.key === " ") {
        // Only while playing, so Space still scrolls the page otherwise.
        if (!playing) {
          return;
        }
        e.preventDefault();
        if (playing) {
          hd.pause();
        } else {
          hd.play();
        }
      } else if (e.key === "ArrowLeft") {
        hd.skip(-1);
      } else if (e.key === "ArrowRight") {
        hd.skip(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, playing]);

  useEffect(() => {
    // Opened from the Listen button: that click is the user gesture.
    if (autoPlay) {
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(
    () => () => {
      tokenRef.current++;
      for (const s of slotsRef.current.filter(Boolean)) {
        s.el.onended = null;
        s.el.onerror = null;
        s.el.pause();
        s.el.removeAttribute("src");
        s.el.load();
      }
    },
    [],
  );

  return {
    state,
    index,
    active,
    speed,
    setSpeed,
    play,
    pause,
    stop,
    skip,
  };
}

// --- paragraph highlight ----------------------------------------------------
// Chunk i of the audio is the i-th narration chunk (see getChunkTexts). The
// reader view doesn't carry chunk boundaries, so match each chunk's opening
// words against the rendered block elements, walking forward in document
// order. Chunks that can't be matched simply don't highlight.
const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,td,th";
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function mapChunksToBlocks(chunks: string[], root: Element) {
  const els = [...root.querySelectorAll(BLOCKS)].filter(
    (e) => !e.querySelector(BLOCKS) && !e.closest("pre"),
  );
  const texts = els.map((e) => norm(e.textContent ?? ""));
  let cur = 0;
  return chunks.map((c) => {
    const key = norm(c).slice(0, 60);
    if (!key) return null;
    for (let j = cur; j < els.length; j++) {
      const t = texts[j];
      // Second case: html-to-text folds a whole list into one chunk.
      if (t && (t.includes(key) || (t.length >= 3 && key.startsWith(t)))) {
        cur = j;
        return els[j];
      }
    }
    return null;
  });
}

const clearHighlight = () =>
  document
    .querySelectorAll(".tts-active")
    .forEach((e) => e.classList.remove("tts-active"));

function useParagraphHighlight(
  chunks: string[] | undefined,
  index: number,
  active: boolean,
) {
  const mapRef = useRef<(Element | null)[] | null>(null);
  useEffect(() => {
    clearHighlight();
    if (!active || !chunks?.length) {
      return;
    }
    // Reader content is mounted in both the desktop and mobile layouts;
    // only one is visible.
    const root = [...document.querySelectorAll(".tts-reader")].find(
      (e) => (e as HTMLElement).offsetParent !== null,
    );
    if (!root) {
      return;
    }
    let map = mapRef.current;
    if (
      !map ||
      (map[index] && !map[index].isConnected) ||
      !map.some((e) => e?.isConnected)
    ) {
      map = mapRef.current = mapChunksToBlocks(chunks, root);
    }
    const el = map[index];
    if (el) {
      el.classList.add("tts-active");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [active, chunks, index]);
  useEffect(() => clearHighlight, []);
}

const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 2];

function TtsPlayer({
  bookmarkId,
  title,
  generatedVoice,
  snapshot,
  refetch,
  autoPlay,
  onClose,
  onChangeVoice,
  onRetry,
}: {
  bookmarkId: string;
  title: string;
  generatedVoice?: string | null;
  snapshot: TtsSnapshot;
  refetch: () => Promise<TtsSnapshot>;
  autoPlay: boolean;
  onClose: () => void;
  onChangeVoice?: (voice: string) => void;
  // Regenerates the narration after a (possibly partial) failure.
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const player = useChunkAudioPlayer(
    snapshot,
    refetch,
    bookmarkId,
    title,
    autoPlay,
  );
  const [expanded, setExpanded] = useState(false);

  const { data: chunkTexts } = useQuery(
    api.tts.getChunkTexts.queryOptions({ bookmarkId }, { staleTime: Infinity }),
  );
  useParagraphHighlight(chunkTexts?.chunks, player.index, player.active);

  const { data: settings } = useQuery(
    api.tts.getSettings.queryOptions(undefined, { enabled: expanded }),
  );
  const { mutate: discover, data: discovered } = useMutation(
    api.tts.discoverVoices.mutationOptions(),
  );
  const baseUrl = settings?.baseUrl;
  useEffect(() => {
    if (expanded && baseUrl) {
      discover({ baseUrl });
    }
  }, [expanded, baseUrl, discover]);
  const [voice, setVoice] = useState("");
  const currentVoice = voice || generatedVoice || settings?.voice || "";

  const isPlaying =
    player.state === "playing" ||
    player.state === "loading" ||
    player.state === "buffering";
  const isGenerating =
    snapshot.status === "generating" || snapshot.status === "pending";
  const status =
    player.state === "buffering"
      ? t("actions.audio_buffering")
      : `${Math.min(player.index + 1, snapshot.totalChunks)} / ${snapshot.totalChunks}` +
        (isGenerating ? ` · ${t("actions.generating_audio")}` : "");
  const failed = player.state === "error" || snapshot.status === "failure";

  const playButton = (
    <Button
      size="icon"
      className="shrink-0 rounded-full"
      aria-label={t(
        isPlaying ? "settings.tts.player.pause" : "settings.tts.player.play",
      )}
      onClick={() => (isPlaying ? player.pause() : player.play())}
    >
      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
    </Button>
  );

  return (
    <div className="w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {playButton}
        <button
          className="min-w-0 flex-1 text-left"
          aria-label={t(
            expanded
              ? "settings.tts.player.collapse"
              : "settings.tts.player.expand",
          )}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {status} · {player.speed}x
          </div>
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(
            expanded
              ? "settings.tts.player.collapse"
              : "settings.tts.player.expand",
          )}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("settings.tts.player.close")}
          onClick={() => {
            player.stop();
            onClose();
          }}
        >
          <X size={16} />
        </Button>
      </div>
      {isPlaying && player.state !== "playing" && (
        <div className="h-0.5 w-full animate-pulse bg-primary" />
      )}
      {expanded && (
        <div className="flex items-center gap-1 border-t px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("settings.tts.player.previous")}
            disabled={player.index <= 0}
            onClick={() => player.skip(-1)}
          >
            <SkipBack size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("settings.tts.player.next")}
            disabled={player.index + 1 >= snapshot.totalChunks}
            onClick={() => player.skip(1)}
          >
            <SkipForward size={16} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1 tabular-nums"
                aria-label={t("settings.tts.player.speed")}
              >
                <Gauge size={14} />
                {player.speed}x
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={String(player.speed)}
                onValueChange={(v) => player.setSpeed(parseFloat(v))}
              >
                {SPEED_PRESETS.map((s) => (
                  <DropdownMenuRadioItem key={s} value={String(s)}>
                    {s}x
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {onChangeVoice && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-w-36 gap-1"
                  aria-label={t("settings.tts.player.voice")}
                  disabled={!discovered}
                >
                  <Mic size={14} className="shrink-0" />
                  <span className="truncate">{currentVoice}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-64 overflow-y-auto"
              >
                <DropdownMenuRadioGroup
                  value={currentVoice}
                  onValueChange={(v) => {
                    // Audio is pre-generated, so a new voice means regenerating.
                    if (
                      v !== currentVoice &&
                      window.confirm(
                        t("settings.tts.player.regenerate_confirm", {
                          voice: v,
                        }),
                      )
                    ) {
                      setVoice(v);
                      onChangeVoice(v);
                    }
                  }}
                >
                  {(discovered?.voices ?? []).map((v) => (
                    <DropdownMenuRadioItem key={v.id} value={v.id}>
                      {v.id}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Link href="/settings/tts" target="_blank" rel="noopener noreferrer">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("settings.tts.player.settings")}
            >
              <Settings size={16} />
            </Button>
          </Link>
        </div>
      )}
      {chunkTexts?.truncated && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          {t("settings.tts.player.truncated", {
            count: chunkTexts.chunks.length,
          })}
        </p>
      )}
      {failed && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <p className="text-xs text-destructive">
            {t("actions.audio_generation_failed")}
          </p>
          {/* The chunks that made it stay playable; this queues the rest. */}
          {snapshot.status === "failure" && onRetry && (
            <Button
              variant="outline"
              size="sm"
              aria-label={t("settings.tts.player.retry_generation")}
              onClick={() => {
                player.stop();
                onRetry();
              }}
            >
              {t("actions.retry")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TtsBookmarkArea({
  bookmark,
  readOnly = false,
}: {
  bookmark: ZBookmark;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { data: ttsConfig } = useQuery(api.tts.isConfigured.queryOptions());
  // Closing the player collapses back to the Listen button (not away).
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useGenerateTts({
    onError: () => {
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });

  // Always hits the server (staleTime 0) so a newly generated chunk is
  // picked up even if the query cache considers the bookmark fresh. This
  // also writes the result into the cache the parent's polling reads from.
  const refetchSnapshot = useCallback(async () => {
    const fresh = await queryClient.fetchQuery({
      ...api.bookmarks.getBookmark.queryOptions({
        bookmarkId: bookmark.id,
      }),
      staleTime: 0,
    });
    return getTtsSnapshot(fresh);
  }, [api, bookmark.id, queryClient]);

  if (
    bookmark.content.type !== BookmarkTypes.LINK &&
    bookmark.content.type !== BookmarkTypes.TEXT
  ) {
    return null;
  }
  const { ttsStatus } = bookmark;
  const snapshot = getTtsSnapshot(bookmark);

  // A regeneration resets the status to "pending" before the old chunks
  // are deleted; don't offer them for playback in the meantime.
  if (snapshot.assetIds.length > 0 && ttsStatus !== "pending") {
    if (!open) {
      return (
        <ActionButton
          variant="secondary"
          className="shadow-lg"
          loading={false}
          onClick={() => setOpen(true)}
        >
          <span className="flex items-center gap-1.5">
            {t("actions.listen")}
            <Headphones className="size-4" />
          </span>
        </ActionButton>
      );
    }
    return (
      // Keyed on the bookmark so navigating to a different bookmark
      // without a full remount resets the player instead of continuing to
      // serve the previous bookmark's audio.
      <TtsPlayer
        key={bookmark.id}
        bookmarkId={bookmark.id}
        title={getBookmarkTitle(bookmark) ?? "Karakeep"}
        generatedVoice={bookmark.ttsVoice}
        snapshot={snapshot}
        refetch={refetchSnapshot}
        autoPlay
        onClose={() => setOpen(false)}
        onChangeVoice={
          readOnly
            ? undefined
            : (voice) => {
                setOpen(true);
                savePos(bookmark.id, 0);
                mutate({ bookmarkId: bookmark.id, voice });
              }
        }
        onRetry={
          readOnly
            ? undefined
            : () => {
                setOpen(true);
                savePos(bookmark.id, 0);
                mutate({
                  bookmarkId: bookmark.id,
                  voice: bookmark.ttsVoice ?? undefined,
                });
              }
        }
      />
    );
  }
  if (ttsStatus === "pending" || ttsStatus === "generating") {
    return (
      <ActionButton
        variant="secondary"
        className="shadow-lg"
        loading={true}
        disabled
      >
        {t("actions.generating_audio")}
      </ActionButton>
    );
  }
  if (ttsConfig?.isConfigured && !readOnly) {
    return (
      <div className="flex flex-col items-center gap-1">
        <ActionButton
          onClick={() => {
            // Open the player as soon as the first chunk lands.
            setOpen(true);
            mutate({ bookmarkId: bookmark.id });
          }}
          variant="secondary"
          className="shadow-lg"
          loading={isPending}
        >
          <span className="flex items-center gap-1.5">
            {ttsStatus === "failure" ? t("actions.retry") : t("actions.listen")}
            <Headphones className="size-4" />
          </span>
        </ActionButton>
        {ttsStatus === "failure" && (
          <p className="rounded bg-background px-2 py-1 text-xs text-destructive shadow">
            {t("actions.audio_generation_failed")}
          </p>
        )}
      </div>
    );
  }
  return null;
}
