import type { ZProblemReportRecentError } from "@karakeep/shared/types/problemReports";
import { MAX_PROBLEM_REPORT_RECENT_ERRORS } from "@karakeep/shared/types/problemReports";

const MAX_MESSAGE_LENGTH = 2000;

// In-memory ring buffer of the most recent client-side errors. It's only ever
// read when the user explicitly submits a problem report.
const recentErrors: ZProblemReportRecentError[] = [];
let installed = false;
// The user the buffered errors belong to. `undefined` means not known yet.
let bufferOwner: string | null | undefined = undefined;

function stringify(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    // JSON.stringify returns undefined for undefined, functions and symbols
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function record(getMessage: () => string, source?: string) {
  let message: string;
  try {
    message = getMessage();
  } catch {
    // Never let error capturing itself throw
    return;
  }
  recentErrors.push({
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    source: source?.slice(0, 500),
    timestamp: new Date().toISOString(),
  });
  if (recentErrors.length > MAX_PROBLEM_REPORT_RECENT_ERRORS) {
    recentErrors.splice(
      0,
      recentErrors.length - MAX_PROBLEM_REPORT_RECENT_ERRORS,
    );
  }
}

export function installRecentErrorCapture() {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  window.addEventListener("error", (event) => {
    record(
      () => stringify(event.error ?? event.message),
      event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : "window.onerror",
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    record(() => stringify(event.reason), "unhandledrejection");
  });

  // eslint-disable-next-line no-console
  const originalConsoleError = console.error;
  // eslint-disable-next-line no-console
  console.error = (...args: unknown[]) => {
    record(() => args.map(stringify).join(" "), "console.error");
    originalConsoleError.apply(console, args);
  };
}

// Login and logout are client-side navigations, so this module outlives a
// session. Drop errors captured under a different account so they're never
// attached to another user's report.
export function setRecentErrorsOwner(userId: string | null) {
  if (bufferOwner !== undefined && bufferOwner !== userId) {
    recentErrors.length = 0;
  }
  bufferOwner = userId;
}

export function getRecentErrors(): ZProblemReportRecentError[] {
  return [...recentErrors];
}
