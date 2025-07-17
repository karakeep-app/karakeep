import type { ActionMeta } from "react-select";
import { useState } from "react";
import { useClientConfig } from "@/lib/clientConfig";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import CreateableSelect from "react-select/creatable";

import type {
  ZAttachedByEnum,
  ZBookmarkTags,
} from "@karakeep/shared/types/tags";

interface EditableTag {
  attachedBy: ZAttachedByEnum;
  value?: string;
  label: string;
}

export function TagsEditor({
  tags: _tags,
  onAttach,
  onDetach,
}: {
  tags: ZBookmarkTags[];
  onAttach: (tag: { tagName: string; tagId?: string }) => void;
  onDetach: (tag: { tagName: string; tagId: string }) => void;
}) {
  const demoMode = !!useClientConfig().demoMode;

  const [optimisticTags, setOptimisticTags] = useState<ZBookmarkTags[]>(_tags);

  const { data: existingTags, isLoading: isExistingTagsLoading } =
    api.tags.list.useQuery();

  existingTags?.tags.sort((a, b) => a.name.localeCompare(b.name));

  const onChange = (
    _option: readonly EditableTag[],
    actionMeta: ActionMeta<EditableTag>,
  ) => {
    switch (actionMeta.action) {
      case "pop-value":
      case "remove-value": {
        if (actionMeta.removedValue.value) {
          setOptimisticTags((prev) =>
            prev.filter((t) => t.id != actionMeta.removedValue.value),
          );
          onDetach({
            tagId: actionMeta.removedValue.value,
            tagName: actionMeta.removedValue.label,
          });
        }
        break;
      }
      case "create-option": {
        setOptimisticTags((prev) => [
          ...prev,
          {
            id: "",
            name: actionMeta.option.label,
            attachedBy: "human" as const,
          },
        ]);
        onAttach({ tagName: actionMeta.option.label });
        break;
      }
      case "select-option": {
        if (actionMeta.option) {
          setOptimisticTags((prev) => [
            ...prev,
            {
              id: actionMeta.option?.value ?? "",
              name: actionMeta.option!.label,
              attachedBy: "human" as const,
            },
          ]);
          onAttach({
            tagName: actionMeta.option.label,
            tagId: actionMeta.option?.value,
          });
        }
        break;
      }
    }
  };

  return (
    <CreateableSelect
      isDisabled={demoMode}
      onChange={onChange}
      options={
        existingTags?.tags.map((t) => ({
          label: t.name,
          value: t.id,
          attachedBy: "human" as const,
        })) ?? []
      }
      value={optimisticTags
        .slice()
        .sort((a) => (a.attachedBy === "human" ? -1 : 1))
        .map((t) => ({
          label: t.name,
          value: t.id,
          attachedBy: t.attachedBy,
        }))}
      isMulti
      closeMenuOnSelect={false}
      isClearable={false}
      isLoading={isExistingTagsLoading}
      theme={(theme) => ({
        ...theme,
        // This color scheme doesn't support disabled options.
        colors: {
          ...theme.colors,
          primary: "hsl(var(--accent))",
          primary50: "hsl(var(--accent))",
          primary75: "hsl(var(--accent))",
          primary25: "hsl(var(--accent))",
        },
      })}
      styles={{
        multiValueRemove: () => ({
          backgroundColor: "transparent",
        }),
        valueContainer: (styles) => ({
          ...styles,
          padding: "0.5rem",
          maxHeight: "14rem",
          overflowY: "auto",
          scrollbarWidth: "thin",
        }),
        container: (styles) => ({
          ...styles,
          width: "100%",
        }),
        control: (styles) => ({
          ...styles,
          overflow: "hidden",
          backgroundColor: "hsl(var(--background))",
          borderColor: "hsl(var(--border))",
          ":hover": {
            borderColor: "hsl(var(--border))",
          },
        }),
        input: (styles) => ({
          ...styles,
          color: "rgb(156 163 175)",
        }),
        menu: (styles) => ({
          ...styles,
          overflow: "hidden",
          color: "rgb(156 163 175)",
        }),
        placeholder: (styles) => ({
          ...styles,
          color: "hsl(var(--muted-foreground))",
        }),
      }}
      components={{
        MultiValueContainer: ({ children, data }) => (
          <div
            className={cn(
              "flex min-h-8 space-x-1 rounded px-2",
              (data as { attachedBy: string }).attachedBy == "ai"
                ? "bg-gradient-to-tr from-purple-500 to-purple-400 text-white"
                : "bg-accent",
            )}
          >
            {children}
          </div>
        ),
        MultiValueLabel: ({ children, data }) => (
          <div className="m-auto flex gap-2">
            {(data as { attachedBy: string }).attachedBy == "ai" && (
              <Sparkles className="m-auto size-4" />
            )}
            {children}
          </div>
        ),
        DropdownIndicator: () => <span />,
        IndicatorSeparator: () => <span />,
      }}
      classNames={{
        multiValueRemove: () => "my-auto",
        valueContainer: () => "gap-2 bg-background text-sm",
        menu: () => "dark:text-gray-300",
        menuList: () => "bg-background text-sm",
        option: () => "text-red-500",
        input: () => "dark:text-gray-300",
      }}
    />
  );
}
