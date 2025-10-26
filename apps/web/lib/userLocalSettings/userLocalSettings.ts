"use server";

import { cookies } from "next/headers";

import type { BookmarksLayoutTypes, UserLocalSettings } from "./types";
import {
  defaultUserLocalSettings,
  parseUserLocalSettings,
  USER_LOCAL_SETTINGS_COOKIE_NAME,
} from "./types";

export async function getUserLocalSettings(): Promise<UserLocalSettings> {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  return (
    parseUserLocalSettings(userSettings?.value) ?? defaultUserLocalSettings()
  );
}

export async function updateBookmarksLayout(layout: BookmarksLayoutTypes) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, bookmarkGridLayout: layout }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateInterfaceLang(lang: string) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, lang }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateGridColumns(gridColumns: number) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, gridColumns }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateShowImages(showImages: boolean) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, showImages }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateShowText(showText: boolean) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, showText }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateShowTags(showTags: boolean) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, showTags }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateRestrictCardHeight(restrictCardHeight: boolean) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, restrictCardHeight }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateImageFit(imageFit: "cover" | "contain") {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed = parseUserLocalSettings(userSettings?.value);
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify({ ...parsed, imageFit }),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}
