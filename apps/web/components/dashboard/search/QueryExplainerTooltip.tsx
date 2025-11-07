import InfoTooltip from "@/components/ui/info-tooltip";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n/client";
import { match } from "@/lib/utils";

import { TextAndMatcher } from "@karakeep/shared/searchQueryParser";
import { Matcher } from "@karakeep/shared/types/search";

export default function QueryExplainerTooltip({
  parsedSearchQuery,
  header,
  className,
}: {
  header?: React.ReactNode;
  parsedSearchQuery: TextAndMatcher & { result: string };
  className?: string;
}) {
  const { t } = useTranslation();
  if (parsedSearchQuery.result == "invalid") {
    return null;
  }

  const MatcherComp = ({ matcher }: { matcher: Matcher }) => {
    switch (matcher.type) {
      case "tagName":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse
                ? t("search.does_not_have_tag")
                : t("search.has_tag")}
            </TableCell>
            <TableCell>{matcher.tagName}</TableCell>
          </TableRow>
        );
      case "listName":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse
                ? t("search.is_not_in_list")
                : t("search.is_in_list")}
            </TableCell>
            <TableCell>{matcher.listName}</TableCell>
          </TableRow>
        );
      case "dateAfter":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse
                ? t("search.not_created_on_or_after")
                : t("search.created_on_or_after")}
            </TableCell>
            <TableCell>{matcher.dateAfter.toDateString()}</TableCell>
          </TableRow>
        );
      case "dateBefore":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse
                ? t("search.not_created_on_or_before")
                : t("search.created_on_or_before")}
            </TableCell>
            <TableCell>{matcher.dateBefore.toDateString()}</TableCell>
          </TableRow>
        );
      case "age":
        return (
          <TableRow>
            <TableCell>
              {matcher.relativeDate.direction === "newer"
                ? t("search.created_within")
                : t("search.created_earlier_than")}
            </TableCell>
            <TableCell>
              {matcher.relativeDate.amount.toString() +
                (matcher.relativeDate.direction === "newer"
                  ? {
                      day: t("search.day_s"),
                      week: t("search.week_s"),
                      month: t("search.month_s"),
                      year: t("search.year_s"),
                    }[matcher.relativeDate.unit]
                  : {
                      day: t("search.day_s_ago"),
                      week: t("search.week_s_ago"),
                      month: t("search.month_s_ago"),
                      year: t("search.year_s_ago"),
                    }[matcher.relativeDate.unit])}
            </TableCell>
          </TableRow>
        );
      case "favourited":
        return (
          <TableRow>
            <TableCell colSpan={2} className="text-center">
              {matcher.favourited
                ? t("search.is_favorited")
                : t("search.is_not_favorited")}
            </TableCell>
          </TableRow>
        );
      case "archived":
        return (
          <TableRow>
            <TableCell colSpan={2} className="text-center">
              {matcher.archived
                ? t("search.is_archived")
                : t("search.is_not_archived")}
            </TableCell>
          </TableRow>
        );
      case "tagged":
        return (
          <TableRow>
            <TableCell colSpan={2} className="text-center">
              {matcher.tagged
                ? t("search.has_any_tag")
                : t("search.has_no_tags")}
            </TableCell>
          </TableRow>
        );
      case "inlist":
        return (
          <TableRow>
            <TableCell colSpan={2} className="text-center">
              {matcher.inList
                ? t("search.is_in_any_list")
                : t("search.is_not_in_any_list")}
            </TableCell>
          </TableRow>
        );
      case "and":
      case "or":
        return (
          <TableRow>
            <TableCell>
              {matcher.type === "and" ? t("search.and") : t("search.or")}
            </TableCell>
            <TableCell>
              <Table>
                <TableBody>
                  {matcher.matchers.map((m, i) => (
                    <MatcherComp key={i} matcher={m} />
                  ))}
                </TableBody>
              </Table>
            </TableCell>
          </TableRow>
        );
      case "url":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse
                ? t("search.url_does_not_contain")
                : t("search.url_contains")}
            </TableCell>
            <TableCell>{matcher.url}</TableCell>
          </TableRow>
        );
      case "title":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse
                ? t("search.title_does_not_contain")
                : t("search.title_contains")}
            </TableCell>
            <TableCell>{matcher.title}</TableCell>
          </TableRow>
        );
      case "rssFeedName":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse
                ? t("search.is_not_from_feed")
                : t("search.is_from_feed")}
            </TableCell>
            <TableCell>{matcher.feedName}</TableCell>
          </TableRow>
        );
      case "type":
        return (
          <TableRow>
            <TableCell>
              {matcher.inverse ? t("search.type_is_not") : t("search.type_is")}
            </TableCell>
            <TableCell>
              {match(matcher.typeName, {
                link: t("common.bookmark_types.link"),
                text: t("common.bookmark_types.text"),
                asset: t("common.bookmark_types.media"),
              })}
            </TableCell>
          </TableRow>
        );
      default: {
        const _exhaustiveCheck: never = matcher;
        return null;
      }
    }
  };

  return (
    <InfoTooltip className={className}>
      {header}
      <Table>
        <TableBody>
          {parsedSearchQuery.text && (
            <TableRow>
              <TableCell>{t("search.full_text_search")}</TableCell>
              <TableCell>{parsedSearchQuery.text}</TableCell>
            </TableRow>
          )}
          {parsedSearchQuery.matcher && (
            <MatcherComp matcher={parsedSearchQuery.matcher} />
          )}
        </TableBody>
      </Table>
    </InfoTooltip>
  );
}
