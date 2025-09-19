import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type OS = "macos" | "ios" | "windows" | "android" | "linux" | null;

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function getOS() {
  if (typeof window === "undefined") return;
  const userAgent = window.navigator.userAgent.toLowerCase();
  const macosPlatforms = /(macintosh|macintel|macppc|mac68k|macos)/i;
  const windowsPlatforms = /(win32|win64|windows|wince)/i;
  const iosPlatforms = /(iphone|ipad|ipod)/i;
  let os: OS = null;

  if (macosPlatforms.test(userAgent)) {
    os = "macos";
  } else if (iosPlatforms.test(userAgent)) {
    os = "ios";
  } else if (windowsPlatforms.test(userAgent)) {
    os = "windows";
  } else if (/android/.test(userAgent)) {
    os = "android";
  } else if (!os && /linux/.test(userAgent)) {
    os = "linux";
  }
  return os;
}

export function match<T extends string | number | symbol, U>(
  val: T,
  options: Record<T, U>,
) {
  return options[val];
}

export function matchFunc<T extends string | number | symbol, U>(
  val: T,
  options: Record<T, () => U>,
) {
  return options[val]();
}
