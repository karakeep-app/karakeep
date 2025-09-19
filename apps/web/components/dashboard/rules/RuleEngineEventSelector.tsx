import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

import type { RuleEngineEvent } from "@karakeep/shared/types/rules";

import { BookmarkListSelector } from "../lists/BookmarkListSelector";
import { TagAutocomplete } from "../tags/TagAutocomplete";

interface EventSelectorProps {
  value: RuleEngineEvent;
  onChange: (event: RuleEngineEvent) => void;
}

export function EventSelector({ value, onChange }: EventSelectorProps) {
  const { t } = useTranslation();
  const handleTypeChange = (type: RuleEngineEvent["type"]) => {
    switch (type) {
      case "bookmarkAdded":
        onChange({ type: "bookmarkAdded" });
        break;
      case "tagAdded":
        onChange({ type: "tagAdded", tagId: "" });
        break;
      case "tagRemoved":
        onChange({ type: "tagRemoved", tagId: "" });
        break;
      case "addedToList":
        onChange({ type: "addedToList", listId: "" });
        break;
      case "removedFromList":
        onChange({ type: "removedFromList", listId: "" });
        break;
      case "favourited":
        onChange({ type: "favourited" });
        break;
      case "archived":
        onChange({ type: "archived" });
        break;
      default: {
        const _exhaustiveCheck: never = type;
        return null;
      }
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Select value={value.type} onValueChange={handleTypeChange}>
            <SelectTrigger id="event-type">
              <SelectValue placeholder="Select event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bookmarkAdded">
                {t("settings.rules.events_types.bookmark_added")}
              </SelectItem>
              <SelectItem value="tagAdded">
                {t("settings.rules.events_types.tag_added")}
              </SelectItem>
              <SelectItem value="tagRemoved">
                {t("settings.rules.events_types.tag_removed")}
              </SelectItem>
              <SelectItem value="addedToList">
                {t("settings.rules.events_types.added_to_list")}
              </SelectItem>
              <SelectItem value="removedFromList">
                {t("settings.rules.events_types.removed_from_list")}
              </SelectItem>
              <SelectItem value="favourited">
                {t("settings.rules.events_types.favourited")}
              </SelectItem>
              <SelectItem value="archived">
                {t("settings.rules.events_types.archived")}
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Additional fields based on event type */}
          {(value.type === "tagAdded" || value.type === "tagRemoved") && (
            <TagAutocomplete
              className="w-full"
              tagId={value.tagId}
              onChange={(t) => onChange({ type: value.type, tagId: t ?? "" })}
            />
          )}

          {(value.type === "addedToList" ||
            value.type === "removedFromList") && (
            <BookmarkListSelector
              listTypes={["manual"]}
              value={value.listId}
              onChange={(l) => onChange({ type: value.type, listId: l })}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
