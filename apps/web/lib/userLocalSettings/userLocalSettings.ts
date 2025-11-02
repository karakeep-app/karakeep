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

async function readModifyWrite(
  modifier: (settings: UserLocalSettings) => Partial<UserLocalSettings>,
) {
  const userSettings = (await cookies()).get(USER_LOCAL_SETTINGS_COOKIE_NAME);
  const parsed =
    parseUserLocalSettings(userSettings?.value) ?? defaultUserLocalSettings();
  const updated = { ...parsed, ...modifier(parsed) };
  (await cookies()).set({
    name: USER_LOCAL_SETTINGS_COOKIE_NAME,
    value: JSON.stringify(updated),
    maxAge: 34560000, // Chrome caps max age to 400 days
    sameSite: "lax",
  });
}

export async function updateBookmarksLayout(layout: BookmarksLayoutTypes) {
  await readModifyWrite(() => ({ bookmarkGridLayout: layout }));
}

export async function updateInterfaceLang(lang: string) {
  await readModifyWrite(() => ({ lang }));
}

export async function updateGridColumns(gridColumns: number) {
  await readModifyWrite(() => ({ gridColumns }));
}

export async function updateShowNotes(showNotes: boolean) {
  await readModifyWrite(() => ({ showNotes }));
}

export async function updateShowTags(showTags: boolean) {
  await readModifyWrite(() => ({ showTags }));
}

export async function updateShowTitle(showTitle: boolean) {
  await readModifyWrite(() => ({ showTitle }));
}

export async function updateImageFit(imageFit: "cover" | "contain") {
  await readModifyWrite(() => ({ imageFit }));
}
