import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  Download,
  List,
  PlusCircle,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RuleEngineAction } from "@karakeep/shared/types/rules";

import { BookmarkListSelector } from "../lists/BookmarkListSelector";
import { TagAutocomplete } from "../tags/TagAutocomplete";

interface ActionBuilderProps {
  value: RuleEngineAction[];
  onChange: (actions: RuleEngineAction[]) => void;
}

export function ActionBuilder({ value, onChange }: ActionBuilderProps) {
  const { t } = useTranslation();
  const handleAddAction = () => {
    onChange([...value, { type: "addTag", tagId: "" }]);
  };

  const handleRemoveAction = (index: number) => {
    const newActions = [...value];
    newActions.splice(index, 1);
    onChange(newActions);
  };

  const handleActionTypeChange = (
    index: number,
    type: RuleEngineAction["type"],
  ) => {
    const newActions = [...value];

    switch (type) {
      case "addTag":
        newActions[index] = { type: "addTag", tagId: "" };
        break;
      case "removeTag":
        newActions[index] = { type: "removeTag", tagId: "" };
        break;
      case "addToList":
        newActions[index] = { type: "addToList", listId: "" };
        break;
      case "removeFromList":
        newActions[index] = { type: "removeFromList", listId: "" };
        break;
      case "downloadFullPageArchive":
        newActions[index] = { type: "downloadFullPageArchive" };
        break;
      case "favouriteBookmark":
        newActions[index] = { type: "favouriteBookmark" };
        break;
      case "archiveBookmark":
        newActions[index] = { type: "archiveBookmark" };
        break;
      default: {
        const _exhaustiveCheck: never = type;
        return null;
      }
    }

    onChange(newActions);
  };

  const handleActionFieldChange = (
    index: number,
    selectVal: RuleEngineAction,
  ) => {
    const newActions = [...value];
    newActions[index] = selectVal;
    onChange(newActions);
  };

  const renderActionIcon = (type: string) => {
    switch (type) {
      case "addTag":
      case "removeTag":
        return <Tag className="h-4 w-4" />;
      case "addToList":
      case "removeFromList":
        return <List className="h-4 w-4" />;
      case "downloadFullPageArchive":
        return <Download className="h-4 w-4" />;
      case "favouriteBookmark":
        return <Star className="h-4 w-4" />;
      case "archiveBookmark":
        return <Archive className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">No actions added yet</p>
        </div>
      ) : (
        value.map((action, index) => (
          <Card key={index}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center">
                  {renderActionIcon(action.type)}
                  <Select
                    value={action.type}
                    onValueChange={(value) =>
                      handleActionTypeChange(
                        index,
                        value as RuleEngineAction["type"],
                      )
                    }
                  >
                    <SelectTrigger className="ml-2 h-8 w-auto border-none bg-transparent px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="addTag">
                        {t("settings.rules.actions_types.add_tag")}
                      </SelectItem>
                      <SelectItem value="removeTag">
                        {t("settings.rules.actions_types.remove_tag")}
                      </SelectItem>
                      <SelectItem value="addToList">
                        {t("settings.rules.actions_types.add_to_list")}
                      </SelectItem>
                      <SelectItem value="removeFromList">
                        {t("settings.rules.actions_types.remove_from_list")}
                      </SelectItem>
                      <SelectItem value="downloadFullPageArchive">
                        {t(
                          "settings.rules.actions_types.download_full_page_archive",
                        )}
                      </SelectItem>
                      <SelectItem value="favouriteBookmark">
                        {t("settings.rules.actions_types.favourite_bookmark")}
                      </SelectItem>
                      <SelectItem value="archiveBookmark">
                        {t("settings.rules.actions_types.archive_bookmark")}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {(action.type === "addTag" ||
                    action.type === "removeTag") && (
                    <TagAutocomplete
                      className="ml-2 h-8 flex-1"
                      tagId={action.tagId}
                      onChange={(t) =>
                        handleActionFieldChange(index, {
                          type: action.type,
                          tagId: t,
                        })
                      }
                    />
                  )}

                  {(action.type === "addToList" ||
                    action.type === "removeFromList") && (
                    <BookmarkListSelector
                      className="ml-2 h-8 flex-1"
                      value={action.listId}
                      listTypes={["manual"]}
                      onChange={(e) =>
                        handleActionFieldChange(index, {
                          type: action.type,
                          listId: e,
                        })
                      }
                    />
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAction(index)}
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddAction}
        className="w-full"
      >
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Action
      </Button>
    </div>
  );
}
