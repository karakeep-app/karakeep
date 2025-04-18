import { NextRequest } from "next/server";
import { buildHandler } from "@/app/api/v1/utils/handler";
import { adaptPagination, zPagination } from "@/app/api/v1/utils/pagination";
import { zGetBookmarkSearchParamsSchema } from "@/app/api/v1/utils/types";

export const dynamic = "force-dynamic";

export const GET = (
  req: NextRequest,
  { params }: { params: { tagId: string } },
) =>
  buildHandler({
    req,
    searchParamsSchema: zPagination.and(zGetBookmarkSearchParamsSchema),
    handler: async ({ api, searchParams }) => {
      const bookmarks = await api.bookmarks.getBookmarks({
        tagId: params.tagId,
        limit: searchParams.limit,
        cursor: searchParams.cursor,
      });
      return {
        status: 200,
        resp: adaptPagination(bookmarks),
      };
    },
  });
