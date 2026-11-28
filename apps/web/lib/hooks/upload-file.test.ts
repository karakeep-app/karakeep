// @vitest-environment jsdom

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZUploadResponse } from "@karakeep/shared/types/uploads";

import useUpload from "./upload-file";

afterEach(() => vi.unstubAllGlobals());

describe("attachment uploads", () => {
  it("uploads and attaches every selected file, serializing quota checks", async () => {
    const files = [
      new File(["solid a"], "a.stl"),
      new File(["solid b"], "b.stl"),
    ];
    const onSuccess = vi.fn<
      (resp: ZUploadResponse, file: File) => Promise<void>
    >(async () => undefined);
    let inFlight = 0;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(inFlight++).toBe(0);
      const body = init.body as FormData;
      expect(body.get("purpose")).toBe("attachment");
      const file = body.get("file") as File;
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return {
        ok: true,
        json: async () => ({
          assetId: file.name,
          fileName: file.name,
          size: file.size,
          contentType: "model/stl",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { result } = renderHook(
      () => useUpload({ purpose: "attachment", onSuccess }),
      {
        wrapper: ({ children }) =>
          // oxlint-disable-next-line react/no-children-prop -- Test config preserves JSX; use createElement.
          React.createElement(QueryClientProvider, { client, children }),
      },
    );
    act(() => files.forEach((file) => result.current.mutate(file)));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(2));
    expect(onSuccess.mock.calls.map((call) => call[0])).toEqual(
      files.map((file) => ({
        assetId: file.name,
        fileName: file.name,
        size: file.size,
        contentType: "model/stl",
      })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
