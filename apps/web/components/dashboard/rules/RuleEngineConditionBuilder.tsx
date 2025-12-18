import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FileType,
  Link,
  PlusCircle,
  Rss,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RuleEngineCondition } from "@karakeep/shared/types/rules";

import { FeedSelector } from "../feeds/FeedSelector";
import { TagAutocomplete } from "../tags/TagAutocomplete";

interface ConditionBuilderProps {
  value: RuleEngineCondition;
  onChange: (condition: RuleEngineCondition) => void;
  level?: number;
  onRemove?: () => void;
}

export function ConditionBuilder({
  value,
  onChange,
  level = 0,
  onRemove,
}: ConditionBuilderProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const handleTypeChange = (type: RuleEngineCondition["type"]) => {
    switch (type) {
      case "urlContains":
        onChange({ type: "urlContains", str: "" });
        break;
      case "urlDoesNotContain":
        onChange({ type: "urlDoesNotContain", str: "" });
        break;
      case "importedFromFeed":
        onChange({ type: "importedFromFeed", feedId: "" });
        break;
      case "bookmarkTypeIs":
        onChange({ type: "bookmarkTypeIs", bookmarkType: "link" });
        break;
      case "hasTag":
        onChange({ type: "hasTag", tagId: "" });
        break;
      case "isFavourited":
        onChange({ type: "isFavourited" });
        break;
      case "isArchived":
        onChange({ type: "isArchived" });
        break;
      case "and":
        onChange({ type: "and", conditions: [] });
        break;
      case "or":
        onChange({ type: "or", conditions: [] });
        break;
      case "alwaysTrue":
        onChange({ type: "alwaysTrue" });
        break;
      default: {
        const _exhaustiveCheck: never = type;
        return null;
      }
    }
  };

  const renderConditionIcon = (type: RuleEngineCondition["type"]) => {
    switch (type) {
      case "urlContains":
      case "urlDoesNotContain":
        return <Link className="h-4 w-4" />;
      case "importedFromFeed":
        return <Rss className="h-4 w-4" />;
      case "bookmarkTypeIs":
        return <FileType className="h-4 w-4" />;
      case "hasTag":
        return <Tag className="h-4 w-4" />;
      case "isFavourited":
        return <Star className="h-4 w-4" />;
      case "isArchived":
        return <Archive className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const renderConditionFields = () => {
    switch (value.type) {
      case "urlContains":
        return (
          <div className="mt-2">
            <Input
              value={value.str}
              onChange={(e) => onChange({ ...value, str: e.target.value })}
              placeholder="URL contains..."
              className="w-full"
            />
          </div>
        );

      case "urlDoesNotContain":
        return (
          <div className="mt-2">
            <Input
              value={value.str}
              onChange={(e) => onChange({ ...value, str: e.target.value })}
              placeholder="URL does not contain..."
              className="w-full"
            />
          </div>
        );

      case "importedFromFeed":
        return (
          <div className="mt-2">
            <FeedSelector
              value={value.feedId}
              onChange={(e) => onChange({ ...value, feedId: e })}
              className="w-full"
            />
          </div>
        );

      case "bookmarkTypeIs":
        return (
          <div className="mt-2">
            <Select
              value={value.bookmarkType}
              onValueChange={(bookmarkType) =>
                onChange({
                  ...value,
                  bookmarkType: bookmarkType as "link" | "text" | "asset",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select bookmark type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="link">
                  {t("common.bookmark_types.link")}
                </SelectItem>
                <SelectItem value="text">
                  {t("common.bookmark_types.text")}
                </SelectItem>
                <SelectItem value="asset">
                  {t("common.bookmark_types.media")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "hasTag":
        return (
          <div className="mt-2">
            <TagAutocomplete
              tagId={value.tagId}
              onChange={(t) => onChange({ type: value.type, tagId: t })}
            />
          </div>
        );

      case "and":
      case "or":
        return (
          <div className="mt-2 space-y-2">
            {value.conditions.map((condition, index) => (
              <ConditionBuilder
                key={index}
                value={condition}
                onChange={(newCondition) => {
                  const newConditions = [...value.conditions];
                  newConditions[index] = newCondition;
                  onChange({ ...value, conditions: newConditions });
                }}
                level={level + 1}
                onRemove={() => {
                  const newConditions = [...value.conditions];
                  newConditions.splice(index, 1);
                  onChange({ ...value, conditions: newConditions });
                }}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                onChange({
                  ...value,
                  conditions: [
                    ...value.conditions,
                    { type: "urlContains", str: "" },
                  ],
                });
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Condition
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  const ConditionSelector = () => (
    <Select value={value.type} onValueChange={handleTypeChange}>
      <SelectTrigger className="ml-2 h-8 border-none bg-transparent px-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="alwaysTrue">
          {t("settings.rules.conditions_types.always")}
        </SelectItem>
        <SelectItem value="and">
          {t("settings.rules.conditions_types.and")}
        </SelectItem>
        <SelectItem value="or">
          {t("settings.rules.conditions_types.or")}
        </SelectItem>
        <SelectItem value="urlContains">
          {t("settings.rules.conditions_types.url_contains")}
        </SelectItem>
        <SelectItem value="urlDoesNotContain">
          {t("settings.rules.conditions_types.url_does_not_contain")}
        </SelectItem>
        <SelectItem value="importedFromFeed">
          {t("settings.rules.conditions_types.imported_from_feed")}
        </SelectItem>
        <SelectItem value="bookmarkTypeIs">
          {t("settings.rules.conditions_types.bookmark_type_is")}
        </SelectItem>
        <SelectItem value="hasTag">
          {t("settings.rules.conditions_types.has_tag")}
        </SelectItem>
        <SelectItem value="isFavourited">
          {t("settings.rules.conditions_types.is_favourited")}
        </SelectItem>
        <SelectItem value="isArchived">
          {t("settings.rules.conditions_types.is_archived")}
        </SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <Card
      className={`border-l-4 ${value.type === "and" ? "border-l-emerald-500" : value.type === "or" ? "border-l-amber-500" : "border-l-slate-300"}`}
    >
      <CardContent className="p-3">
        {value.type === "and" || value.type === "or" ? (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-1">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <ConditionSelector />
                <span className="ml-1 text-sm text-muted-foreground">
                  {value.conditions.length} condition
                  {value.conditions.length !== 1 ? "s" : ""}
                </span>
              </div>

              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>

            <CollapsibleContent>{renderConditionFields()}</CollapsibleContent>
          </Collapsible>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {renderConditionIcon(value.type)}
                <ConditionSelector />
              </div>

              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>

            {renderConditionFields()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
