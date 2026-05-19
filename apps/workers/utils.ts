/**
 * Helpers for `Promise.race` without the classic memory leak.
 *
 * The leak: when you race a short-lived work promise against a long-lived
 * cancellation promise (abort signal, shared timer, etc.), the losing side's
 * handlers stay registered on the long-lived producer even after the race
 * settles. Over many races this pins closures — and everything they capture —
 * in memory until the long-lived promise finally resolves or the signal fires.
 *
 * The fix: each contender exposes an explicit `cleanup()` that detaches its
 * listener / clears its timer. `raceWith` runs cleanups in a `finally` so the
 * loser releases its hold the instant the race resolves.
 */
export interface RaceContender<T> {
  /** Promise to include in `Promise.race`. Rejections are pre-swallowed so a
   *  losing contender does not trigger `unhandledRejection`. */
  promise: Promise<T>;
  /** Releases resources held by this contender (listener, timer). Idempotent
   *  and safe to call even if the contender won the race. */
  cleanup: () => void;
}

/**
 * Contender that rejects when `signal` aborts.
 *
 * Attaches a single `{ once: true }` listener; `cleanup()` removes it so
 * signals shared across many races do not accumulate dead listeners.
 */
export function abortRace(signal: AbortSignal): RaceContender<never> {
  if (signal.aborted) {
    const promise = Promise.reject(signal.reason ?? new Error("AbortError"));
    promise.catch(() => {
      /* suppress unhandledRejection */
    });
    return {
      promise,
      cleanup: () => {
        /* nothing to clean up */
      },
    };
  }

  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new Error("AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  promise.catch(() => {
    /* suppress unhandledRejection if race loses */
  });

  return {
    promise,
    cleanup: () => {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Like `abortRace` but resolves with `value` on abort instead of rejecting.
 *
 * Use when the caller treats abort as a sentinel (e.g. return `null` / empty
 * buffer) and calls `signal.throwIfAborted()` itself afterwards.
 */
export function abortRaceResolve<T>(
  signal: AbortSignal,
  value: T,
): RaceContender<T> {
  const base = abortRace(signal);
  return {
    promise: base.promise.catch(() => value),
    cleanup: base.cleanup,
  };
}

/**
 * Contender that fires after `ms` milliseconds and resolves (or rejects) with
 * whatever `onTimeout` returns/throws. `cleanup()` calls `clearTimeout` so a
 * timer whose race already ended does not keep its closure alive.
 */
export function timeoutRace<T>(
  ms: number,
  onTimeout: () => T | PromiseLike<T>,
): RaceContender<T> {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      try {
        resolve(onTimeout());
      } catch (e) {
        reject(e);
      }
    }, ms);
  });
  return {
    promise,
    cleanup: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

/** Convenience: `timeoutRace` that rejects with `new Error(message)`. */
export function timeoutRejectRace<T>(
  ms: number,
  message: string,
): RaceContender<T> {
  return timeoutRace<T>(ms, () => {
    throw new Error(message);
  });
}

/**
 * `Promise.race` wrapper that always runs each contender's `cleanup()` once
 * the race settles — regardless of which side won or threw.
 *
 * Prefer this over `Promise.race([...])` whenever any contender is backed by
 * a shared/long-lived producer (abort signal, timer, etc.).
 *
 * @example
 * await raceWith(
 *   page.screenshot(),
 *   timeoutRejectRace(5000, "screenshot timed out"),
 *   abortRaceResolve(signal, Buffer.alloc(0)),
 * );
 */
export async function raceWith<T>(
  work: Promise<T>,
  ...contenders: RaceContender<T>[]
): Promise<T> {
  try {
    return await Promise.race([work, ...contenders.map((c) => c.promise)]);
  } finally {
    for (const c of contenders) c.cleanup();
  }
}

/**
 * Wraps `func` so each call rejects if it does not settle within `timeoutSec`.
 * Backed by `raceWith` + `timeoutRejectRace`, so the pending timer is cleared
 * the moment `func` resolves — no lingering timer pinning the result in memory.
 */
export function withTimeout<T, Ret>(
  func: (param: T) => Promise<Ret>,
  timeoutSec: number,
) {
  return async (param: T): Promise<Ret> => {
    return raceWith<Ret>(
      func(param),
      timeoutRejectRace<Ret>(
        timeoutSec * 1000,
        `Timed-out after ${timeoutSec} secs`,
      ),
    );
  };
}
